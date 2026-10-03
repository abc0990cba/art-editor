import { bench, describe } from 'vitest'

import { paletteLuma } from '../color/color.ts'
import { elementFromDoc } from '../core/doc-style.ts'
import { defaultDoc, makeCells, type Doc } from '../core/doc.ts'
import { newLayer, newObj, syncDoc, type SceneLayer, type SceneObj } from '../core/scene.ts'
import { evalGraphMemo } from './eval-memo.ts'
import { evalGraph, evalGraphStages } from './index.ts'
import type { Cells, Graph } from './types.ts'

/**
 * Node-graph evaluation benches — previously uncovered (the PERFLOG M4b row noted graph benches
 * were missing). Fixtures are representative procedural objects: an ellipse source, quad symmetry,
 * a ×3 linear array and a position gradient ramp. At 4096² that lands ~1M map cells per eval — the
 * cost every node edit (param scrub) or graph-object commit pays today.
 *
 * Spike scenarios also measure the two PERFLOG research candidates:
 *
 * - Layout decoupling: a card `pos` change today clones the graph → identity memo miss → full
 *   re-eval; with `pos` outside the `Graph` the memo hits and the eval disappears;
 * - Dirty-suffix evaluation: only nodes downstream of the edited one re-run (the prefix result is
 *   cached; suffix re-eval via `evalGraph(suffix, base, prefixCells)`).
 */

const PALETTE = [
  '#1d3557',
  '#e63946',
  '#2a9d8f',
  '#f1faee',
  '#457b9d',
  '#ffb703',
  '#8ecae6',
  '#023047',
]

function evalInput(bw: number) {
  return {
    bw,
    bh: bw,
    paletteLen: PALETTE.length,
    hexValue: (hex: string): number => Math.max(1, PALETTE.indexOf(hex.toLowerCase()) + 1),
    luma: (value: number): number => paletteLuma(PALETTE, value),
    baseStyle: elementFromDoc(defaultDoc()),
  }
}

/** Chain of 4 raster nodes: ellipse → quad symmetry → ×3 linear array → gradient ramp. */
function graphChain(bw: number): Graph {
  return {
    graphVersion: 1,
    nodes: [
      {
        id: 'n1',
        op: 'source.ellipse',
        params: {
          cx: Math.round(bw * 0.25),
          cy: Math.round(bw * 0.25),
          rx: Math.round(bw * 0.05),
          ry: Math.round(bw * 0.04),
          color: '#e63946',
        },
      },
      { id: 'n2', op: 'mod.symmetry', params: { mode: 'quad', n: 4 } },
      {
        id: 'n3',
        op: 'mod.arrayGrid',
        params: { count: 3, dx: Math.round(bw * 0.22), dy: 0 },
      },
      { id: 'n4', op: 'ramp.gradient', params: { angle: 0, from: 1, to: 4 } },
    ],
  }
}

const heavy4096 = graphChain(4096)
const light512 = graphChain(512)
const base4096 = evalInput(4096)
const base512 = evalInput(512)
const noInk: Cells = new Map()

/** Scrubbing `n` on the symmetry node (index 1): everything downstream re-runs. */
const scrubbed = {
  ...heavy4096,
  nodes: heavy4096.nodes.map((n, i) => (i === 1 ? { ...n, params: { ...n.params, n: 6 } } : n)),
}
const prefixGraph: Graph = { graphVersion: 1, nodes: heavy4096.nodes.slice(0, 2) }
const suffixGraph: Graph = { graphVersion: 1, nodes: heavy4096.nodes.slice(2) }
const prefixCells = evalGraph(prefixGraph, base4096).cells

describe('evalGraph (full graph evaluation, per edit/commit)', () => {
  bench(
    'heavy chain @ 4096² (~1M cells out)',
    () => {
      evalGraph(heavy4096, base4096)
    },
    { iterations: 4, warmupIterations: 1 },
  )
  bench(
    'light chain @ 512²',
    () => {
      evalGraph(light512, base512)
    },
    { iterations: 20, warmupIterations: 2 },
  )
  bench(
    'evalGraphStages @ 4096² (node-editor previews, per-stage map copies)',
    () => {
      evalGraphStages(heavy4096, base4096)
    },
    { iterations: 3, warmupIterations: 1 },
  )
})

describe('node-card drag: pos-only graph change through the identity memo', () => {
  bench(
    'current: pos inside Graph → new object → memo miss (full eval)',
    () => {
      const moved: Graph = {
        ...heavy4096,
        nodes: heavy4096.nodes.map((n) => ({ ...n, pos: { x: 40, y: 12 } })),
      }
      evalGraphMemo(moved, base4096, noInk, PALETTE)
    },
    { iterations: 3, warmupIterations: 1 },
  )
  bench(
    'decoupled: pos outside Graph → stable identity → memo hit',
    () => {
      evalGraphMemo(heavy4096, base4096, noInk, PALETTE)
    },
    { iterations: 8, warmupIterations: 2 },
  )
})

describe('param scrub: all-or-nothing vs dirty-suffix re-evaluation @ 4096²', () => {
  bench(
    'current: params change → full re-eval (nodes 1..4)',
    () => {
      evalGraph(scrubbed, base4096)
    },
    { iterations: 3, warmupIterations: 1 },
  )
  bench(
    'spike: dirty suffix only (nodes 3..4, prefix cached)',
    () => {
      evalGraph(suffixGraph, base4096, prefixCells)
    },
    { iterations: 6, warmupIterations: 1 },
  )
})

/** Scene doc of one graph object (the composite-bake fixture for pos-change commits). */
function graphSceneDoc(bw: number): { base: Doc; layer: SceneLayer; obj: SceneObj } {
  const doc = defaultDoc()
  doc.cols = bw
  doc.rows = bw
  doc.sub = 1
  doc.cells = makeCells(bw, bw, 1)
  doc.elements = []
  doc.layers = null
  const style = elementFromDoc(doc)
  const { layer, doc: withLayer } = newLayer(doc, 'graph')
  const { obj, doc: withObj } = newObj(withLayer, style, 'procedural')
  obj.graph = graphChain(bw)
  return { base: syncDoc({ ...withObj, layers: [layer] }), layer, obj }
}

describe('pos-only commit: composite bake through syncDoc (graph object)', () => {
  const { base: scene2048, layer, obj } = graphSceneDoc(2048)
  bench(
    'current: new graph object → eval miss + full-buffer repaint (2048²)',
    () => {
      const moved: Graph = {
        ...obj.graph!,
        nodes: obj.graph!.nodes.map((n) => ({ ...n, pos: { x: 7, y: 3 } })),
      }
      syncDoc({ ...scene2048, layers: [{ ...layer, children: [{ ...obj, graph: moved }] }] })
    },
    { iterations: 4, warmupIterations: 1 },
  )
  bench(
    'decoupled: stable graph identity → eval hit, repaint only (2048²)',
    () => {
      syncDoc({ ...scene2048, layers: [{ ...layer, children: [{ ...obj, graph: obj.graph! }] }] })
    },
    { iterations: 6, warmupIterations: 1 },
  )
})
