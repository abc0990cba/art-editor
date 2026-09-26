import { sceneBenchDoc, strokeCells } from '../../engine/bench-doc.util.ts'
import { useStore } from '../../state/editor.store.ts'

/**
 * Browser-side benchmark scenarios for the ?bench=1 harness. Each scenario drives the REAL app
 * pipeline — store actions, React render, canvas effects, pointer/wheel events — and measures
 * dispatch → second-paint wall time, so the numbers reflect what a user's frame actually costs.
 */

export interface BenchPoint {
  name: string
  median: number
  mean: number
  min: number
  max: number
  p95: number
  n: number
  ok: boolean
  note?: string
}

export interface BenchGroup {
  group: string
  points: BenchPoint[]
}

export interface BenchReportData {
  startedAt: string
  finishedAt: string
  userAgent: string
  dpr: number
  cores: number
  deviceMemoryGb: number | null
  viewport: string
  /** False when the pane painted no frames during the run (stroke cadence fell back to hops). */
  framesLive: boolean
  groups: BenchGroup[]
}

interface CanvasSize {
  size: number
  objs: number
  perObj: number
  reps: number
}

/** Canvas sizes under test: today's max, the M1 target and the final 4096² goal (~5–10% ink). */
const SIZES: CanvasSize[] = [
  { size: 512, objs: 50, perObj: 524, reps: 4 },
  { size: 2048, objs: 100, perObj: 2100, reps: 3 },
  { size: 4096, objs: 100, perObj: 8400, reps: 2 },
]

const sleep = (ms: number) =>
  new Promise<void>((r) => {
    setTimeout(r, ms)
  })
/**
 * Throttle-immune macrotask hop (MessageChannel is not clamped in hidden pages, unlike timers). A
 * dozen hops always covers React's scheduler: render → commit → passive canvas effects. The timed
 * region ends here, so measured numbers are "dispatch → render + effects complete" and are honest
 * even when the browser pane is occluded (paint itself is excluded by design).
 */
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
/**
 * Untimed settle between reps: let a real frame paint when the pane is visible. Chromium can stop
 * rAF for an occluded webview while document.hidden still reports false, so a missed frame flips
 * `framesLive` off and the stroke cadence switches to effect-flush hops for the rest of the run.
 */
let framesLive = true
const settlePaint = () =>
  new Promise<void>((r) => {
    let done = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = () => {
      if (timer) clearTimeout(timer)
      if (!done) {
        done = true
        r()
      }
    }
    timer = setTimeout(() => {
      framesLive = false
      finish()
    }, 250)
    requestAnimationFrame(() => {
      requestAnimationFrame(finish)
    })
  })

function stats(samples: number[]): Omit<BenchPoint, 'name' | 'n' | 'ok' | 'note'> {
  const s = [...samples].sort((a, b) => a - b)
  const at = (q: number) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))] ?? 0
  return {
    median: at(0.5),
    mean: s.reduce((a, b) => a + b, 0) / s.length,
    min: s[0] ?? 0,
    max: s.at(-1) ?? 0,
    p95: at(0.95),
  }
}

function baseCanvas(): HTMLCanvasElement {
  const canvas = document.querySelector('canvas')
  if (!canvas) throw new Error('canvas not mounted')
  return canvas
}

function store() {
  return useStore.getState()
}

/** Drop undo history so retired docs don't pin tens of MB per rep. */
function dropHistory() {
  useStore.temporal.getState().clear()
}

async function loadCanvas(c: CanvasSize): Promise<void> {
  dropHistory()
  store().loadDoc(sceneBenchDoc(c.size, c.size, c.objs, c.perObj))
  // refit the view: without it the previous scenario's view can put the stroke path off-grid
  store().requestFit()
  await settlePaint()
  await sleep(120)
}

function wheel(canvas: HTMLCanvasElement, dy: number): void {
  const r = canvas.getBoundingClientRect()
  canvas.dispatchEvent(
    new WheelEvent('wheel', {
      deltaY: dy,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
      bubbles: true,
      cancelable: true,
    }),
  )
}

function pointerEvent(
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
): void {
  canvas.dispatchEvent(
    new PointerEvent(type, {
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: type === 'pointermove' ? -1 : 0,
      buttons: type === 'pointerup' ? 0 : 1,
      clientX: x,
      clientY: y,
      bubbles: true,
      cancelable: true,
    }),
  )
}

interface MeasureResult {
  samples: number[]
  occluded: number
}

async function measure(
  reps: number,
  prepare: () => Promise<void>,
  step: () => Promise<void>,
): Promise<MeasureResult> {
  const samples: number[] = []
  let occluded = 0
  for (let i = 0; i < reps; i++) {
    await prepare()
    await settlePaint()
    const t0 = performance.now()
    await step()
    await flushEffects()
    samples.push(performance.now() - t0)
    if (document.hidden) occluded++
  }
  dropHistory()
  return { samples, occluded }
}

function point(
  name: string,
  { samples, occluded }: MeasureResult,
  extra?: { ok?: boolean; note?: string },
): BenchPoint {
  return {
    name,
    ...stats(samples),
    n: samples.length,
    ok: extra?.ok ?? true,
    note: occluded > 0 ? `pane occluded during ${occluded}/${samples.length} samples` : extra?.note,
  }
}

async function loadScenario(c: CanvasSize): Promise<BenchPoint> {
  const result = await measure(
    c.reps,
    async () => {
      dropHistory()
      await sleep(50)
    },
    async () => {
      store().loadDoc(sceneBenchDoc(c.size, c.size, c.objs, c.perObj))
    },
  )
  return point(`loadDoc ${c.size}²`, result)
}

async function commitScenario(c: CanvasSize): Promise<BenchPoint> {
  const ink = strokeCells(2000, 64 * c.size + 32)
  const result = await measure(
    Math.max(3, Math.min(c.reps, 6)),
    () => loadCanvas(c),
    async () => {
      store().paintCells(ink, store().doc.palette[0] ?? '#000000')
    },
  )
  return point(`commit 2000 cells on ${c.size}²`, result)
}

async function zoomScenario(c: CanvasSize): Promise<BenchPoint> {
  const canvas = baseCanvas()
  let dir = -120
  const result = await measure(
    Math.max(3, c.reps * 2),
    () => loadCanvas(c),
    async () => {
      wheel(canvas, dir)
      dir = -dir
    },
  )
  return point(`wheel zoom step on ${c.size}²`, result)
}

async function strokeScenario(c: CanvasSize): Promise<BenchPoint> {
  const canvas = baseCanvas()
  let ok = true
  let note: string | undefined
  const result = await measure(
    Math.max(1, Math.min(c.reps, 3)),
    async () => {
      await loadCanvas(c)
      store().setTool('pencil')
    },
    async () => {
      const r = canvas.getBoundingClientRect()
      const x0 = r.left + r.width * 0.25
      const y0 = r.top + r.height * 0.5
      const before = store().doc
      pointerEvent('pointerdown', canvas, x0, y0)
      for (let k = 1; k <= 60; k++) {
        pointerEvent('pointermove', canvas, x0 + k * (r.width * 0.008), y0 + (k % 2) * 14)
        // real input cadence is one stroke frame per painted frame; when the pane paints no
        // frames (occluded webview), fall back to effect-flush hops so the run keeps moving
        await (framesLive ? settlePaint() : flushEffects())
      }
      pointerEvent('pointerup', canvas, x0 + r.width * 0.5, y0)
      await flushEffects()
      if (store().doc === before) {
        ok = false
        note = 'stroke did not commit (synthetic input rejected?)'
      }
    },
  )
  return point(`pencil stroke e2e ×60 on ${c.size}²`, result, { ok, note })
}

async function undoScenario(c: CanvasSize): Promise<BenchPoint> {
  const ink = strokeCells(2000, 64 * c.size + 32)
  const result = await measure(
    Math.max(2, Math.min(c.reps, 4)),
    async () => {
      await loadCanvas(c)
      store().paintCells(ink, store().doc.palette[0] ?? '#000000')
      await settlePaint()
      // zundo pushes history on a 350 ms trailing throttle — let the entry land
      await sleep(420)
    },
    async () => {
      useStore.temporal.getState().undo()
    },
  )
  return point(`undo on ${c.size}²`, result)
}

export type ProgressFn = (message: string) => void

/** Run every scenario group in sequence; each point is individually guarded against failure. */
export async function runBenchScenarios(
  onProgress: ProgressFn = () => {},
): Promise<BenchReportData> {
  const report: BenchReportData = {
    startedAt: new Date().toISOString(),
    finishedAt: '',
    userAgent: navigator.userAgent,
    dpr: window.devicePixelRatio,
    cores: navigator.hardwareConcurrency,
    deviceMemoryGb: (navigator as { deviceMemory?: number }).deviceMemory ?? null,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    framesLive: true,
    groups: [],
  }
  onProgress('building fixtures…')
  framesLive = true
  const scenarioDefs: [string, (c: CanvasSize) => Promise<BenchPoint>][] = [
    ['loadDoc (composite + geometry + effects)', loadScenario],
    ['commit (paintCells 2000 cells → effects)', commitScenario],
    ['zoom (wheel step → full art rebuild)', zoomScenario],
    ['pencil stroke e2e (60 moves + commit)', strokeScenario],
    ['undo (restore previous doc state)', undoScenario],
  ]
  for (const [group, run] of scenarioDefs) {
    onProgress(`${group}…`)
    const points: BenchPoint[] = []
    for (const c of SIZES) {
      try {
        points.push(await run(c))
      } catch (error) {
        points.push({
          name: `${c.size}²`,
          median: 0,
          mean: 0,
          min: 0,
          max: 0,
          p95: 0,
          n: 0,
          ok: false,
          note: error instanceof Error ? error.message : String(error),
        })
      }
    }
    report.groups.push({ group, points })
  }
  report.finishedAt = new Date().toISOString()
  report.framesLive = framesLive
  ;(window as unknown as { __benchReport: BenchReportData }).__benchReport = report
  onProgress('done')
  return report
}
