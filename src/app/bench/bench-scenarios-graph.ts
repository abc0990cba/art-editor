import { sceneBenchDoc } from '../../engine/bench-doc.util.ts'
import { elementFromDoc } from '../../engine/doc-style.ts'
import { defaultDoc, makeCells, type Doc } from '../../engine/doc.ts'
import type { Graph } from '../../engine/nodes/index.ts'
import { newLayer, newObj, syncDoc } from '../../engine/scene.ts'
import { useStore } from '../../state/editor.store.ts'
import type { BenchPoint } from './bench-scenarios.ts'

/**
 * Extra ?bench=1 scenario groups for the perf research (docs/perf-research.md): the node-graph edit
 * pipeline, gesture bursts and the idle-with-selection overlay burn. Same measurement contract as
 * bench-scenarios.ts — dispatch → render + canvas effects complete, per-tick flush where the
 * scenario models per-event work.
 */

export interface ExtraCanvasSize {
  size: number
  objs: number
  perObj: number
  reps: number
}
export type ExtraScenarioDef = [string, (c: ExtraCanvasSize) => Promise<BenchPoint>]

const sleep = (ms: number) =>
  new Promise<void>((r) => {
    setTimeout(r, ms)
  })

const flushEffects = () =>
  new Promise<void>((r) => {
    let hops = 0
    const ch = new MessageChannel()
    ch.port1.onmessage = () => {
      hops++
      if (hops >= 12) {
        ch.port1.close()
        r()
      } else ch.port2.postMessage(0)
    }
    ch.port2.postMessage(0)
  })

const settlePaint = () =>
  new Promise<void>((r) => {
    let done = false
    const finish = () => {
      if (!done) {
        done = true
        r()
      }
    }
    setTimeout(finish, 250)
    requestAnimationFrame(() => {
      requestAnimationFrame(finish)
    })
  })

const frameTick = () =>
  Promise.race([
    new Promise<void>((r) => {
      requestAnimationFrame(() => {
        r()
      })
    }),
    sleep(50),
  ])

function store() {
  return useStore.getState()
}

function dropHistory() {
  useStore.temporal.getState().clear()
}

/** The 4-node chain from engine/graph.bench.ts: ellipse → quad symmetry → ×3 array → ramp. */
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
      { id: 'n3', op: 'mod.arrayGrid', params: { count: 3, dx: Math.round(bw * 0.22), dy: 0 } },
      { id: 'n4', op: 'ramp.gradient', params: { angle: 0, from: 1, to: 4 } },
    ],
  }
}

/** Scene doc of one graph object — the fixture every graph scenario loads. */
function graphFixtureDoc(size: number): Doc {
  const doc = defaultDoc()
  doc.cols = size
  doc.rows = size
  doc.sub = 1
  doc.cells = makeCells(size, size, 1)
  doc.elements = []
  doc.layers = null
  const { layer, doc: withLayer } = newLayer(doc, 'graph')
  const { obj, doc: withObj } = newObj(withLayer, elementFromDoc(doc), 'procedural')
  obj.graph = graphChain(size)
  layer.children.push(obj)
  return syncDoc({ ...withObj, layers: [layer] })
}

function firstObjId(doc: Doc): number {
  const layer = doc.layers?.[0]
  if (!layer) throw new Error('graph fixture expected')
  for (const item of layer.children) if (item.kind === 'obj') return item.id
  throw new Error('no objects in fixture')
}

async function loadGraphCanvas(size: number): Promise<number> {
  dropHistory()
  store().loadDoc(graphFixtureDoc(size))
  store().requestFit()
  await settlePaint()
  await sleep(120)
  return firstObjId(store().doc)
}

async function measure(
  reps: number,
  prepare: () => Promise<void>,
  step: () => Promise<void>,
): Promise<number[]> {
  const samples: number[] = []
  for (let i = 0; i < reps; i++) {
    await prepare()
    await settlePaint()
    const t0 = performance.now()
    await step()
    await flushEffects()
    samples.push(performance.now() - t0)
  }
  dropHistory()
  return samples
}

function point(name: string, samples: number[], note?: string): BenchPoint {
  const s = [...samples].sort((a, b) => a - b)
  const at = (q: number) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))] ?? 0
  return {
    name,
    median: at(0.5),
    mean: s.reduce((a, b) => a + b, 0) / s.length,
    min: s[0] ?? 0,
    max: s[s.length - 1] ?? 0,
    p95: at(0.95),
    n: s.length,
    ok: true,
    note,
  }
}

/** Drag ticks scale down with canvas size: the per-tick cost itself is the measured quantity. */
const TICKS: Record<number, number> = { 512: 24, 2048: 14, 4096: 6 }

async function nodeDragScenario(c: ExtraCanvasSize): Promise<BenchPoint> {
  const ticks = TICKS[c.size] ?? 10
  const result = await measure(
    Math.max(1, Math.min(c.reps, 2)),
    async () => {
      await loadGraphCanvas(c.size)
    },
    async () => {
      const id = firstObjId(store().doc)
      for (let k = 0; k < ticks; k++) {
        const graph = store().doc.layers?.[0]?.children[0]
        if (!graph || graph.kind !== 'obj' || !graph.graph) throw new Error('graph obj lost')
        const moved: Graph = {
          ...graph.graph,
          nodes: graph.graph.nodes.map((n) => ({ ...n, pos: { x: k * 8, y: k * 5 } })),
        }
        store().setObjectGraph(id, moved)
        await flushEffects()
      }
    },
  )
  return point(`node drag ×${ticks} (pos-only clones, per-tick effects) on ${c.size}²`, result)
}

async function paramScrubScenario(c: ExtraCanvasSize): Promise<BenchPoint> {
  const ticks = TICKS[c.size] ?? 10
  const result = await measure(
    Math.max(1, Math.min(c.reps, 2)),
    async () => {
      await loadGraphCanvas(c.size)
    },
    async () => {
      const id = firstObjId(store().doc)
      for (let k = 0; k < ticks; k++) {
        const graph = store().doc.layers?.[0]?.children[0]
        if (!graph || graph.kind !== 'obj' || !graph.graph) throw new Error('graph obj lost')
        const n = k % 2 ? 6 : 4
        const scrubbed: Graph = {
          ...graph.graph,
          nodes: graph.graph.nodes.map((node, i) =>
            i === 1 ? { ...node, params: { ...node.params, n } } : node,
          ),
        }
        store().setObjectGraph(id, scrubbed)
        await flushEffects()
      }
    },
  )
  return point(`param scrub ×${ticks} (semantic changes, per-tick effects) on ${c.size}²`, result)
}

async function wheelBurstScenario(c: ExtraCanvasSize): Promise<BenchPoint> {
  const canvas = document.querySelector('canvas')
  if (!canvas) throw new Error('canvas not mounted')
  const result = await measure(
    Math.max(2, c.reps),
    async () => {
      dropHistory()
      store().loadDoc(sceneBenchDoc(c.size, c.size, c.objs, c.perObj))
      store().requestFit()
      await settlePaint()
      await sleep(120)
    },
    async () => {
      const r = canvas.getBoundingClientRect()
      for (let k = 0; k < 10; k++) {
        canvas.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: k % 2 ? 120 : -120,
            clientX: r.left + r.width / 2,
            clientY: r.top + r.height / 2,
            bubbles: true,
            cancelable: true,
          }),
        )
      }
    },
  )
  return point(`wheel burst ×10 (one flush) on ${c.size}²`, result)
}

async function idleSelectionScenario(c: ExtraCanvasSize): Promise<BenchPoint> {
  const result = await measure(
    Math.max(2, c.reps),
    async () => {
      dropHistory()
      store().loadDoc(sceneBenchDoc(c.size, c.size, c.objs, c.perObj))
      store().requestFit()
      await settlePaint()
      await sleep(120)
    },
    async () => {
      const layer = store().doc.layers?.[0]
      if (!layer) throw new Error('scene fixture expected')
      for (const item of layer.children) {
        if (item.kind === 'obj') {
          store().selectElements([item.id])
          break
        }
      }
      for (let f = 0; f < 30; f++) await frameTick()
      store().clearSelection()
      await flushEffects()
    },
  )
  return point(`idle selection overlay ×30 frames on ${c.size}²`, result)
}

export const extraScenarioDefs: ExtraScenarioDef[] = [
  ['node drag (pos-only graph edits → full pipeline)', nodeDragScenario],
  ['param scrub (semantic graph edits → full pipeline)', paramScrubScenario],
  ['wheel burst (10 ticks, one flush → art rebuilds)', wheelBurstScenario],
  ['idle selection (marching-ants overlay frames)', idleSelectionScenario],
]
