/** Procedural crown: band + spike array + jewel holes, seeded asymmetry. */

import { fillCellsEvenOdd } from '../shapefill.ts'
import { linePoints } from '../shapes.ts'
import { combineCells } from './context.ts'
import { defineNode, Resolved, type Cells, type NodeParamSpec } from './types.ts'

const CROWN_PARAMS: Record<string, NodeParamSpec> = {
  x: { kind: 'number', min: -1024, max: 3072, default: 4, span: 'x' },
  y: { kind: 'number', min: -1024, max: 3072, default: 6, span: 'y' },
  w: { kind: 'number', min: 6, max: 2048, default: 16, span: 'size' },
  h: { kind: 'number', min: 6, max: 2048, default: 12, span: 'size' },
  spikes: { kind: 'int', min: 3, max: 12, default: 5 },
  spikeShape: {
    kind: 'select',
    options: ['triangle', 'diamond', 'rounded', 'gothic', 'double', 'notched'],
    default: 'triangle',
  },
  spikeHeight: { kind: 'number', min: 0.2, max: 0.9, default: 0.62 },
  spikeWidth: { kind: 'number', min: 0.3, max: 1, default: 0.78 },
  jaggedness: { kind: 'number', min: 0, max: 1, default: 0.15 },
  asymmetry: { kind: 'number', min: 0, max: 1, default: 0 },
  bandHeight: { kind: 'number', min: 0.08, max: 0.4, default: 0.2 },
  jewels: { kind: 'int', min: 0, max: 12, default: 5 },
  jewelSize: { kind: 'number', min: 0.02, max: 0.3, default: 0.09 },
  seed: { kind: 'int', min: 1, max: 9999, default: 7 },
  color: { kind: 'hex', default: '#f4a261' },
  mode: {
    kind: 'select',
    options: ['add', 'subtract', 'intersect'],
    default: 'add',
  },
}

type Poly = Array<[number, number]>

interface CrownOpts {
  x: number
  y: number
  w: number
  h: number
  spikes: number
  spikeShape: string
  spikeHeight: number
  spikeWidth: number
  jaggedness: number
  asymmetry: number
  bandHeight: number
  jewels: number
  jewelSize: number
  seed: number
}

function crownOpts(p: Resolved): CrownOpts {
  return {
    x: p.num('x'),
    y: p.num('y'),
    w: p.num('w'),
    h: p.num('h'),
    spikes: p.int('spikes'),
    spikeShape: p.str('spikeShape'),
    spikeHeight: p.num('spikeHeight'),
    spikeWidth: p.num('spikeWidth'),
    jaggedness: p.num('jaggedness'),
    asymmetry: p.num('asymmetry'),
    bandHeight: p.num('bandHeight'),
    jewels: p.int('jewels'),
    jewelSize: p.num('jewelSize'),
    seed: p.int('seed'),
  }
}

function seededRandom(seed: number): () => number {
  let a = (Math.floor(seed) * 2654435761) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Profile of one spike: polyline from (x0, base) up and back down to (x1, base). */
function spikePolyline(
  shape: string,
  x0: number,
  x1: number,
  baseY: number,
  tipY: number,
  rnd: () => number,
  jag: number,
): Poly {
  const midX = (x0 + x1) / 2
  const w = x1 - x0
  const h = baseY - tipY
  const j = (a: number, b: number) => a + (rnd() * 2 - 1) * jag * b
  switch (shape) {
    case 'diamond':
      return [
        [x0, baseY],
        [midX, tipY],
        [x1, baseY],
      ]
    case 'rounded':
      return [
        [x0, baseY],
        [x0 + w * 0.18, tipY + h * 0.3],
        [midX, tipY],
        [x1 - w * 0.18, tipY + h * 0.3],
        [x1, baseY],
      ]
    case 'gothic':
      // two arcs meeting at a sharp point (ogive)
      return [
        [x0, baseY],
        [j(midX - w * 0.06, w * 0.1), tipY + h * 0.18],
        [j(midX, w * 0.06), tipY],
        [j(midX + w * 0.06, w * 0.1), tipY + h * 0.18],
        [x1, baseY],
      ]
    case 'double': {
      // two sub-peaks with a notch between
      const ny = tipY + h * 0.35
      return [
        [x0, baseY],
        [x0 + w * 0.25, tipY + h * 0.12],
        [x0 + w * 0.34, ny],
        [x0 + w * 0.5, tipY + h * 0.28],
        [x0 + w * 0.66, ny],
        [x1 - w * 0.25, tipY + h * 0.12],
        [x1, baseY],
      ]
    }
    case 'notched': {
      // tall sides with a V notch cut into the center top
      return [
        [x0, baseY],
        [x0 + w * 0.22, tipY],
        [x0 + w * 0.4, tipY + h * 0.22],
        [midX, tipY + h * 0.34],
        [x1 - w * 0.4, tipY + h * 0.22],
        [x1 - w * 0.22, tipY],
        [x1, baseY],
      ]
    }
    default:
      // triangle with seeded apex drift
      return [
        [x0, baseY],
        [j(midX, w * 0.25), tipY],
        [x1, baseY],
      ]
  }
}

function tracePoly(poly: Poly, cells: Set<number>, bw: number, bh: number): void {
  const put = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < bw && y < bh) cells.add(y * bw + x)
  }
  for (let i = 1; i < poly.length; i++) {
    for (const [x, y] of linePoints(
      Math.round(poly[i - 1][0]),
      Math.round(poly[i - 1][1]),
      Math.round(poly[i][0]),
      Math.round(poly[i][1]),
    )) {
      put(x, y)
    }
  }
  // close non-closed polylines back to the start
  const [fx, fy] = poly[0]
  const [lx, ly] = poly[poly.length - 1]
  if (fx !== lx || fy !== ly) {
    for (const [x, y] of linePoints(Math.round(lx), Math.round(ly), Math.round(fx), Math.round(fy)))
      put(x, y)
  }
}

/** Full silhouette loop: left half generated, mirrored to the right with asymmetry jitter. */
function crownLoop(o: CrownOpts, rnd: () => number): Poly {
  const { x, y, w, h, spikes, bandHeight } = o
  const bandTop = y + h * (1 - bandHeight)
  const tipBase = y
  const spikeSpan = w / spikes
  const half = Math.ceil(spikes / 2)
  const left: Poly = [[x, bandTop]]
  for (let k = 0; k < half; k++) {
    const x0 = x + spikeSpan * k
    const x1 = x0 + spikeSpan * o.spikeWidth
    const tipY =
      tipBase +
      (1 - o.spikeHeight) * h +
      (o.asymmetry > 0 ? (rnd() - 0.5) * o.asymmetry * h * 0.3 : 0)
    const spike = spikePolyline(o.spikeShape, x0, x1, bandTop, Math.max(tipY, y), rnd, o.jaggedness)
    if (k === half - 1) {
      // keep only up to the apex — the rest comes from the mirror
      const apex = spike.reduce((best, pt, i) => (pt[1] < spike[best][1] ? i : best), 0)
      for (let i = 1; i <= apex; i++) left.push(spike[i])
    } else {
      left.push(...spike)
    }
  }
  const loop: Poly = [...left]
  for (let i = left.length - 1; i >= 0; i--) {
    const [mx, my] = left[i]
    const mirroredX = 2 * (x + w / 2) - mx
    loop.push([mirroredX + (o.asymmetry > 0 ? (rnd() * 2 - 1) * o.asymmetry * w * 0.06 : 0), my])
  }
  loop.push(loop[0])
  return loop
}

function crownCells(o: CrownOpts, bw: number, bh: number): Cells {
  const rnd = seededRandom(o.seed)
  const loop = crownLoop(o, rnd)
  const outline = new Set<number>()
  tracePoly(loop, outline, bw, bh)
  // close the silhouette along the band bottom edge
  tracePoly(
    [
      [o.x, o.y + o.h],
      [o.x + o.w, o.y + o.h],
    ],
    outline,
    bw,
    bh,
  )
  const filled = fillCellsEvenOdd([loop], bw, bh)
  const cells: Cells = new Map()
  for (const i of filled) cells.set(i, 1)
  for (const i of outline) cells.set(i, 1)
  // Bresenham of a mirrored float polyline is not always the exact mirror — union the
  // geometric mirror so the silhouette is symmetric to the cell
  const cx2 = 2 * (o.x + o.w / 2)
  const mirrored: number[] = []
  for (const [i, v] of cells) {
    const x = i % bw
    const mx = Math.round(cx2 - (x + 0.5))
    if (mx !== x) mirrored.push(Math.floor(mx) + bw * Math.floor(i / bw))
    void v
  }
  for (const i of mirrored) cells.set(i, cells.get(i) ?? 1)
  // jewel holes: seeded rings along the band
  if (o.jewels > 0) {
    const jr = Math.max(0.6, o.jewelSize * Math.min(o.w, o.h))
    const bandCy = o.y + o.h * (1 - o.bandHeight / 2)
    for (let k = 0; k < o.jewels; k++) {
      const jx =
        o.x + (o.w * (k + 0.5)) / o.jewels + (o.asymmetry > 0 ? (rnd() - 0.5) * o.asymmetry * 2 : 0)
      const ring: Poly = []
      const steps = Math.max(10, Math.round(jr * 6))
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2
        ring.push([jx + jr * Math.cos(a), bandCy + jr * Math.sin(a)])
      }
      tracePoly(ring, outline, bw, bh)
      // a jewel ring hole: remove the ring outline AND its interior
      const hole = new Set<number>()
      for (const i of outline) {
        const x = i % bw
        const y2 = Math.floor(i / bw)
        if (Math.hypot(x + 0.5 - jx, y2 + 0.5 - bandCy) <= jr + 0.9) hole.add(i)
      }
      // mirror the deletion too: hole rounding is not self-symmetric
      const cx2 = 2 * (o.x + o.w / 2)
      for (const i of hole) {
        cells.delete(i)
        const x = i % bw
        const mx = Math.round(cx2 - (x + 0.5))
        if (mx !== x) cells.delete(Math.floor(mx) + bw * Math.floor(i / bw))
      }
    }
  }
  return cells
}

export const CROWN_NODES = [
  defineNode({
    id: 'source.crown',
    kind: 'source',
    domain: { in: 'none', out: 'raster' },
    label: 'Crown',
    category: 'sources',
    tags: ['crown', 'king', 'royal', 'jewels', 'procedural', 'object'],
    params: CROWN_PARAMS,
    evaluate: (ctx, p, input) => {
      const cells = crownCells(crownOpts(p), ctx.bw, ctx.bh)
      const v = ctx.hexValue(p.str('color'))
      for (const [i] of cells) cells.set(i, v)
      return combineCells(input, cells, p.str('mode'))
    },
  }),
]
