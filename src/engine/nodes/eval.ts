/**
 * Graph evaluation. Two flow modes:
 *
 * - `edges` present → topological pass over the raster graph; several wires into one input merge by
 *   union; the final picture is the union of the sink outputs;
 * - No edges → the list order is the flow: each raster node feeds the next. Style nodes always write
 *   the cloned base style in list order (order only matters between two style nodes writing the
 *   same field). Unknown (version-skew) nodes are skipped, not removed — graphs survive app-version
 *   skew without data loss.
 */

import type { ElementStyle } from '../doc'
import { withNodeRng } from './context'
import { nodeDef, resolveParams } from './registry'
import type { Cells, Graph, GraphNode, RasterNodeDef } from './types'

export interface EvalInput {
  /** Buffer size in cells */
  bw: number
  bh: number
  /** Number of entries in the (derived) palette — ramps clamp against it */
  paletteLen: number
  /** Hex color → 1-based palette value */
  hexValue: (hex: string) => number
  /** The object's appearance the style nodes write on top of (never mutated) */
  baseStyle: ElementStyle
}

export interface EvalOutput {
  cells: Cells
  /** The evaluated appearance (a clone of the base style, written by style nodes) */
  style: ElementStyle
}

export interface GraphStage {
  /** Id of the raster node that produced this stage */
  id: string
  cells: Cells
}

/**
 * Evaluate each raster node cumulatively (prefix stages) — powers per-node previews: stage k shows
 * what the chain produces through node k. Style nodes don't add stages (they only write the
 * appearance clone).
 */
export function evalGraphStages(
  graph: Graph,
  base: EvalInput,
  input?: Cells,
): { stages: GraphStage[]; style: ElementStyle } {
  const style = cloneBaseStyle(base.baseStyle)
  const procedural = graph.nodes.some((n) => !n.unknown && nodeDef(n.op)?.kind === 'source')
  const baseCells: Cells = procedural || input === undefined ? new Map() : input
  // style nodes first, in list order (they only write appearance fields)
  for (const node of graph.nodes) {
    if (node.unknown) continue
    const def = nodeDef(node.op)
    if (!def || def.kind !== 'style') continue
    def.evaluate(withNodeRng(base, node.id, node.op), resolveParams(node.op, node.params), style)
  }
  const stages: GraphStage[] = []
  const hasEdges = (graph.edges?.length ?? 0) > 0
  if (hasEdges) {
    const edges = graph.edges!
    const raster = new Map<string, { node: GraphNode; def: RasterNodeDef }>()
    for (const node of graph.nodes) {
      if (node.unknown) continue
      const def = nodeDef(node.op)
      if (def && def.kind !== 'style') raster.set(node.id, { node, def: def as RasterNodeDef })
    }
    const incoming = new Map<string, string[]>()
    const outgoing = new Map<string, string[]>()
    const indegree = new Map<string, number>()
    for (const e of edges) {
      if (!raster.has(e.from) || !raster.has(e.to)) continue
      const ins = incoming.get(e.to) ?? []
      ins.push(e.from)
      incoming.set(e.to, ins)
      const outs = outgoing.get(e.from) ?? []
      outs.push(e.to)
      outgoing.set(e.from, outs)
      indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1)
    }
    const order: string[] = []
    const ready = [...raster.keys()].filter((id) => !(indegree.get(id) ?? 0))
    const pending = new Map(indegree)
    while (ready.length > 0) {
      const id = ready.shift()!
      order.push(id)
      for (const to of outgoing.get(id) ?? []) {
        const left = (pending.get(to) ?? 1) - 1
        pending.set(to, left)
        if (left === 0) ready.push(to)
      }
    }
    for (const id of raster.keys()) if (!order.includes(id)) order.push(id)
    const outputs = new Map<string, Cells>()
    for (const id of order) {
      const { node, def } = raster.get(id)!
      const acc: Cells = new Map()
      for (const src of incoming.get(id) ?? []) {
        for (const [i, v] of outputs.get(src) ?? []) if (!acc.has(i)) acc.set(i, v)
      }
      const out = def.evaluate(
        withNodeRng(base, id, node.op),
        resolveParams(node.op, node.params),
        acc,
      )
      outputs.set(id, out)
      stages.push({ id, cells: out })
    }
  } else {
    let acc: Cells = baseCells
    for (const node of graph.nodes) {
      if (node.unknown) continue
      const def = nodeDef(node.op)
      if (!def || def.kind === 'style') continue
      acc = def.evaluate(
        withNodeRng(base, node.id, node.op),
        resolveParams(node.op, node.params),
        acc,
      )
      stages.push({ id: node.id, cells: new Map(acc) })
    }
  }
  return { stages, style }
}

/**
 * Evaluate a graph; deterministic — the same graph, palette and base style always produce identical
 * cells. The base style is never mutated. The object's own stored ink acts as the implicit first
 * input — EXCEPT when the graph contains a source node: then the graph is fully procedural and the
 * stored ink is ignored (moving or editing source params never leaves stale pixels behind).
 */
export function evalGraph(graph: Graph, base: EvalInput, input?: Cells): EvalOutput {
  const { stages, style } = evalGraphStages(graph, base, input)
  return {
    cells: stages.length > 0 ? stages[stages.length - 1].cells : (input ?? new Map()),
    style,
  }
}

/** The appearance a single style node produces over the base style (for previews). */
export function evaluatedStyleFor(
  op: string,
  params: Record<string, number | string | boolean>,
  baseStyle: ElementStyle,
): ElementStyle {
  const style = cloneBaseStyle(baseStyle)
  const def = nodeDef(op)
  if (def?.kind === 'style')
    def.evaluate({ rng: () => 0.5 } as never, resolveParams(op, params), style)
  return style
}

function cloneBaseStyle(base: ElementStyle): ElementStyle {
  return {
    style: { ...base.style, corners: { ...base.style.corners } },
    renderMode: base.renderMode,
    connectivity: base.connectivity,
    metaball: { ...base.metaball },
    texture: { ...base.texture },
  }
}
