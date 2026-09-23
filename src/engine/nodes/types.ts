/**
 * Node system contract: data domains, parameter schemas, the graph data model and the
 * `defineNode` factory.
 *
 * The core (registry + evaluator) knows nothing about specific effects. Adding a node
 * means adding one `defineNode` call in a family file under `nodes/` — the editor UI,
 * the AI tool schema and the conformance tests pick it up from the registry alone.
 *
 * Domains keep operations honest as the system grows:
 *  - `raster` — a map "buffer cell → palette value", the medium the whole engine speaks;
 *  - `style`  — the object's appearance parameters (consumed by the path builders);
 *  - `vector` — reserved for future contour/SDF nodes, no core changes required.
 */

import type { ElementStyle } from '../doc'

export type NodeDomain = 'raster' | 'style' | 'vector'

/** Semantic family: sources paint, mods transform, ramps recolor, styles dress. */
export type NodeKind = 'source' | 'mod' | 'ramp' | 'style'

/**
 * What a numeric parameter measures, when it scales with the canvas: `x`/`y` are
 * absolute coordinates along an axis, `size` is a length/distance in cells, `delta`
 * is a signed shift. Marked params get editor ranges derived from the current grid
 * (canvas ±15%) instead of their static schema bounds.
 */
export type ParamSpan = 'x' | 'y' | 'size' | 'delta'

export type NodeParamSpec =
  | { kind: 'number'; min: number; max: number; step?: number; default: number; span?: ParamSpan }
  | { kind: 'int'; min: number; max: number; default: number; span?: ParamSpan }
  | { kind: 'select'; options: readonly string[]; default: string }
  | { kind: 'hex'; default: string }
  | { kind: 'bool'; default: boolean }

export type ParamValue = number | string | boolean

/** The raster medium: buffer index → palette value (1-based). */
export type Cells = Map<number, number>

/**
 * Blender-style type coloring: the socket/wire color says WHAT flows through it, not
 * the direction. One palette here — the editor and any future node UI read this map.
 */
export const DOMAIN_STYLE: Record<NodeDomain, { wire: string; label: string; socketRing: string }> = {
  raster: { wire: '#818cf8', label: 'pixels', socketRing: 'border-indigo-300 bg-indigo-400/60' },
  style: { wire: '#34d399', label: 'style', socketRing: 'border-emerald-300 bg-emerald-400/60' },
  vector: { wire: '#fb923c', label: 'vector', socketRing: 'border-orange-300 bg-orange-400/60' },
}

/**
 * Typed read-only view over a node's resolved parameters (defaults filled, values
 * clamped against the schema by the registry before evaluation).
 */
export class Resolved {
  constructor(private readonly values: Record<string, ParamValue>) {}
  /** the stored primitive, exactly as resolved (defaults filled, clamped) */
  raw(key: string): ParamValue {
    return this.values[key]
  }
  num(key: string): number {
    const v = this.values[key]
    return typeof v === 'number' ? v : Number(v) || 0
  }
  int(key: string): number {
    return Math.round(this.num(key))
  }
  str(key: string): string {
    const v = this.values[key]
    return typeof v === 'string' ? v : String(v)
  }
  bool(key: string): boolean {
    return this.values[key] === true
  }
}

/** Everything an evaluate function may reach for. `rng` is node-bound and deterministic. */
export interface EvalContext {
  /** buffer size in cells */
  bw: number
  bh: number
  /** number of entries in the (derived) palette */
  paletteLen: number
  /** hex color → 1-based palette value */
  hexValue: (hex: string) => number
  /** deterministic [0,1) randomness, stable for (node, key) pairs */
  rng: (key: string) => number
}

interface NodeBase {
  id: string
  /** human label (English, doubles as the AI-facing name) */
  label: string
  /** UI group for the add-node menu */
  category: string
  /** keywords for AI search */
  tags?: readonly string[]
  params: Record<string, NodeParamSpec>
}

/** Paints or transforms the accumulated cell map. */
export interface RasterNodeDef extends NodeBase {
  kind: 'source' | 'mod' | 'ramp'
  domain: { in: NodeDomain | 'none'; out: NodeDomain }
  evaluate: (ctx: EvalContext, p: Resolved, input: Cells) => Cells
}

/** Writes the object's appearance on a clone the evaluator provides. */
export interface StyleNodeDef extends NodeBase {
  kind: 'style'
  domain: { in: 'style' | 'none'; out: 'style' }
  evaluate: (ctx: EvalContext, p: Resolved, style: ElementStyle) => void
}

export type AnyNodeDef = RasterNodeDef | StyleNodeDef

/** Identity helper — keeps node definitions honest and gives TS the narrowing hook. */
export function defineNode(def: AnyNodeDef): AnyNodeDef {
  return def
}

/* ------------------------------- graph data model ------------------------------- */

export interface GraphNode {
  /** unique within the graph, stable across edits */
  id: string
  op: string
  params: Record<string, ParamValue>
  /**
   * Set by the validator when the op is missing from this build's registry: the node is
   * kept (graphs round-trip across app versions) but the evaluator skips it.
   */
  unknown?: boolean
  /** editor card position on the node canvas (UI metadata, serialized) */
  pos?: { x: number; y: number }
}

/** A wire: the cell map of the `from` node flows into the `to` node's input. */
export interface GraphEdge {
  from: string
  to: string
}

export interface Graph {
  graphVersion: 1
  nodes: GraphNode[]
  /**
   * Explicit wires. When present they define the raster flow (multiple wires into one
   * input merge by union); when absent the node list order is the flow — each node
   * feeds the next, like a chain.
   */
  edges?: GraphEdge[]
}

export function emptyGraph(): Graph {
  return { graphVersion: 1, nodes: [] }
}
