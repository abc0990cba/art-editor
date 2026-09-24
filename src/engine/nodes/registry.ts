/**
 * Node registry: registration, lookup, the machine-readable schema export (AI bridge) and defensive
 * graph validation. Registration happens once, from `nodes/index.ts`.
 */

import type { AnyNodeDef, Graph, GraphNode, ParamValue } from './types'
import { Resolved } from './types'

const byId = new Map<string, AnyNodeDef>()

/** Register one node. Duplicate ids are a programming error, not a runtime event. */
export function registerNode(def: AnyNodeDef): void {
  if (byId.has(def.id)) throw new Error(`node "${def.id}" is already registered`)
  byId.set(def.id, def)
}

export function registerNodes(defs: readonly AnyNodeDef[]): void {
  for (const def of defs) registerNode(def)
}

export function nodeDef(op: string): AnyNodeDef | undefined {
  return byId.get(op)
}

export function allNodes(): AnyNodeDef[] {
  return [...byId.values()]
}

/** Fill defaults and clamp against the schema: untrusted params become safe params. */
export function resolveParams(op: string, params: Record<string, ParamValue>): Resolved {
  const def = byId.get(op)
  const values: Record<string, ParamValue> = {}
  if (!def) return new Resolved(values)
  for (const [key, spec] of Object.entries(def.params)) {
    const raw = params[key]
    switch (spec.kind) {
      case 'number':
      case 'int': {
        let n = Number(raw ?? spec.default)
        if (!Number.isFinite(n)) n = spec.default
        n = Math.max(spec.min, Math.min(spec.max, n))
        values[key] = spec.kind === 'int' ? Math.round(n) : n
        break
      }
      case 'select':
        values[key] = spec.options.includes(raw as never) ? (raw as string) : spec.default
        break
      case 'hex': {
        const s = typeof raw === 'string' ? raw : ''
        values[key] = /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : spec.default
        break
      }
      case 'bool':
        values[key] = typeof raw === 'boolean' ? raw : spec.default
        break
    }
  }
  return new Resolved(values)
}

/** The registry as the machine-readable tool schema handed to AI integrations. */
export function registryJSON(): string {
  return JSON.stringify(
    {
      graphVersion: 1,
      note: 'A graph references these ops top-down; each raster node receives the accumulated cell map and returns a new one.',
      nodes: allNodes().map((d) => ({
        id: d.id,
        kind: d.kind,
        label: d.label,
        category: d.category,
        tags: d.tags ?? [],
        domain: d.domain,
        params: Object.fromEntries(Object.entries(d.params).map(([k, s]) => [k, s])),
      })),
    },
    null,
    2,
  )
}

/** Every hex color referenced by a graph's color params (derived-palette building). */
export function graphColors(graph: Graph): string[] {
  const out: string[] = []
  for (const node of graph.nodes) {
    const def = byId.get(node.op)
    if (!def || node.unknown) continue
    for (const [key, spec] of Object.entries(def.params)) {
      if (spec.kind !== 'hex') continue
      const v = node.params[key]
      if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) out.push(v.toLowerCase())
    }
  }
  return out
}

export type ValidateResult = {
  ok: boolean
  errors: string[]
  warnings: string[]
  graph: Graph
}

/**
 * Validate untrusted graph JSON. Structurally valid payloads always come back `ok` with a cleaned
 * graph: unknown operations are kept flagged (`unknown: true`, the evaluator skips them) so graphs
 * survive app-version skew, and every parameter is clamped to the registry schema, and edges
 * referencing dropped nodes are removed — cycles are broken at a back-edge with a warning. Only
 * broken shapes (not an object, `nodes` not an array) fail.
 */
export function validateGraph(raw: unknown): ValidateResult {
  const fail = (errors: string[]): ValidateResult => ({
    ok: false,
    errors,
    warnings: [],
    graph: { graphVersion: 1, nodes: [] },
  })
  if (typeof raw !== 'object' || raw === null) return fail(['not an object'])
  const d = raw as Record<string, unknown>
  if (!Array.isArray(d.nodes)) return fail(['nodes: expected an array'])
  const warnings: string[] = []
  const clean: GraphNode[] = []
  const ids = new Set<string>()
  d.nodes.forEach((rawNode, index) => {
    if (typeof rawNode !== 'object' || rawNode === null) {
      warnings.push(`node #${index}: dropped (not an object)`)
      return
    }
    const n = rawNode as Record<string, unknown>
    if (typeof n.op !== 'string') {
      warnings.push(`node #${index}: dropped (missing op)`)
      return
    }
    const known = byId.has(n.op)
    if (!known) warnings.push(`node #${index}: unknown op "${n.op}" kept but skipped`)
    let id = typeof n.id === 'string' && n.id ? n.id : `n${index}`
    while (ids.has(id)) id = `${id}~`
    ids.add(id)
    const params: Record<string, ParamValue> = {}
    if (typeof n.params === 'object' && n.params !== null) {
      for (const [k, v] of Object.entries(n.params as Record<string, unknown>)) {
        if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') params[k] = v
      }
    }
    const resolved = known ? resolveParams(n.op, params) : undefined
    const pos =
      typeof n.pos === 'object' && n.pos !== null
        ? (() => {
            const p = n.pos as Record<string, unknown>
            const x = Number(p.x)
            const y = Number(p.y)
            return {
              x: Number.isFinite(x) ? Math.max(-100000, Math.min(100000, x)) : 0,
              y: Number.isFinite(y) ? Math.max(-100000, Math.min(100000, y)) : 0,
            }
          })()
        : undefined
    clean.push({
      id,
      op: n.op,
      params: known && resolved ? strip(resolved, n.op) : params,
      unknown: known ? undefined : true,
      ...(pos ? { pos } : {}),
    })
  })

  // edges: keep only wires between surviving nodes, deduplicate, break cycles
  const edges: Array<{ from: string; to: string }> = []
  if (Array.isArray(d.edges)) {
    const seen = new Set<string>()
    for (const rawEdge of d.edges) {
      if (typeof rawEdge !== 'object' || rawEdge === null) continue
      const e = rawEdge as Record<string, unknown>
      const from = typeof e.from === 'string' ? e.from : ''
      const to = typeof e.to === 'string' ? e.to : ''
      if (!ids.has(from) || !ids.has(to) || from === to) {
        warnings.push(`edge ${from || '?'}→${to || '?'}: dropped (missing endpoint)`)
        continue
      }
      const key = `${from}→${to}`
      if (seen.has(key)) continue
      seen.add(key)
      edges.push({ from, to })
    }
    breakCycles(clean, edges, warnings)
  }
  return {
    ok: true,
    errors: [],
    warnings,
    graph: { graphVersion: 1, nodes: clean, ...(edges.length > 0 ? { edges } : {}) },
  }
}

/** Remove back-edges so the raster flow stays acyclic (each removed edge is a warning). */
function breakCycles(
  nodes: GraphNode[],
  edges: Array<{ from: string; to: string }>,
  warnings: string[],
): void {
  const childrenOf = new Map<string, Set<string>>()
  for (const e of edges) {
    let set = childrenOf.get(e.from)
    if (!set) childrenOf.set(e.from, (set = new Set()))
    set.add(e.to)
  }
  const state = new Map<string, 1 | 2>() // 1 = on stack, 2 = done
  const walk = (id: string): void => {
    state.set(id, 1)
    for (const child of childrenOf.get(id) ?? []) {
      if (state.get(child) === 1) {
        childrenOf.get(id)?.delete(child)
        warnings.push(`edge ${id}→${child}: dropped (would form a loop)`)
        continue
      }
      if (!state.get(child)) walk(child)
    }
    state.set(id, 2)
  }
  for (const n of nodes) if (!state.get(n.id)) walk(n.id)
  for (let i = edges.length - 1; i >= 0; i--) {
    const e = edges[i]
    if (!childrenOf.get(e.from)?.has(e.to)) {
      warnings.push(`edge ${e.from}→${e.to}: dropped (would form a loop)`)
      edges.splice(i, 1)
    }
  }
}

/** Resolved → plain primitives keyed by the schema (storage keeps raw values). */
function strip(resolved: Resolved, op: string): Record<string, ParamValue> {
  const def = byId.get(op)
  const out: Record<string, ParamValue> = {}
  if (!def) return out
  for (const key of Object.keys(def.params)) out[key] = resolved.raw(key)
  return out
}
