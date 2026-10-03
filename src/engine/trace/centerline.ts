/**
 * Centerline tracing for line art: threshold → Zhang–Suen thinning → skeleton chain extraction →
 * simplification → cubic fitting → SVG stroke paths. Local stroke thickness comes from a chamfer
 * distance transform of the original binary (a skeleton pixel's distance to the background ≈ half
 * the stroke width), so `strokeWidth: 0` estimates per-chain widths.
 *
 * Geometry is flat number arrays of x,y pairs in pixel coordinates.
 */

import type { ImportBitmap } from '../import/index.ts'
import { formatNum, type SvgPath } from './compose.ts'
import { fitChain } from './fit-curves.ts'
import type { TraceParams } from './params.ts'
import { simplifyOpen } from './simplify.ts'

export interface CenterlineResult {
  paths: SvgPath[]
  vertices: number
}

/** Foreground = ink: luminance below the threshold (or above, when inverted); alpha ≥ 128 only. */
export function thresholdMask(bitmap: ImportBitmap, params: TraceParams): Uint8Array {
  const { width: w, height: h, data } = bitmap
  const mask = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const o = i * 4
    if (data[o + 3] < 128) continue
    const lum = 0.2126 * data[o]! + 0.7152 * data[o + 1]! + 0.0722 * data[o + 2]!
    const ink = params.binaryInvert ? lum > params.binaryThreshold : lum < params.binaryThreshold
    mask[i] = ink ? 1 : 0
  }
  return mask
}

/**
 * Zhang–Suen thinning, in place, until stable. Even-thickness shapes end up two pixels wide, so a
 * final 2×2-block pruning pass (drop the top-left pixel of every full block) leaves a one-pixel
 * skeleton — otherwise every interior pixel of a 2-wide line looks like a junction.
 */
export function thinZhangSuen(mask: Uint8Array, w: number, h: number): void {
  const thinner = createThinner(mask, w, h)
  for (;;) {
    const first = thinner.pass(true)
    if (first.length === 0) break
    thinner.apply(first)
    const second = thinner.pass(false)
    if (second.length === 0) break
    thinner.apply(second)
  }
  pruneToOnePixel(mask, w, h)
}

function createThinner(
  mask: Uint8Array,
  w: number,
  h: number,
): {
  pass: (first: boolean) => number[]
  apply: (list: number[]) => void
} {
  const at = (x: number, y: number): number =>
    x >= 0 && y >= 0 && x < w && y < h ? mask[y * w + x]! : 0
  const pass = (first: boolean): number[] => {
    const toDelete: number[] = []
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (deletable(first, at, x, y)) toDelete.push(y * w + x)
      }
    }
    return toDelete
  }
  return {
    pass,
    apply: (list: number[]) => {
      for (const i of list) mask[i] = 0
    },
  }
}

/** Zhang–Suen deletion conditions for one pixel (first/second subiteration). */
function deletable(
  first: boolean,
  at: (x: number, y: number) => number,
  x: number,
  y: number,
): boolean {
  if (!at(x, y)) return false
  // ordered ring p2..p9: N, NE, E, SE, S, SW, W, NW
  const p2 = at(x, y - 1)
  const p3 = at(x + 1, y - 1)
  const p4 = at(x + 1, y)
  const p5 = at(x + 1, y + 1)
  const p6 = at(x, y + 1)
  const p7 = at(x - 1, y + 1)
  const p8 = at(x - 1, y)
  const p9 = at(x - 1, y - 1)
  const ring = [p2, p3, p4, p5, p6, p7, p8, p9]
  let neighbors = 0
  let transitions = 0
  for (let k = 0; k < 8; k++) {
    neighbors += ring[k]
    if (ring[k] === 0 && ring[(k + 1) % 8] === 1) transitions++
  }
  if (neighbors < 2 || neighbors > 6 || transitions !== 1) return false
  if (first) return p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0
  return p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0
}

/** Drop the top-left pixel of every full 2×2 block until none remain (2-thick → 1-thick). */
function pruneToOnePixel(mask: Uint8Array, w: number, h: number): void {
  for (;;) {
    let pruned = 0
    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w - 1; x++) {
        const i = y * w + x
        if (mask[i] && mask[i + 1] && mask[i + w] && mask[i + w + 1]) {
          mask[i] = 0
          pruned++
        }
      }
    }
    if (pruned === 0) return
  }
}

/** Chamfer distance transform: for each foreground pixel, ~distance to the nearest background. */
export function distanceTransform(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e9
  const d = new Float32Array(w * h)
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? INF : 0
  chamferPass(d, w, h, true)
  chamferPass(d, w, h, false)
  return d
}

/** One chamfer sweep (1 / √2 steps); forward scans top-left → bottom-right, backward the reverse. */
function chamferPass(d: Float32Array, w: number, h: number, forward: boolean): void {
  const xs = forward ? [0, 1] : [w - 1, -1]
  const ys = forward ? [0, 1] : [h - 1, -1]
  for (let y = ys[0]; forward ? y < h : y >= 0; y += ys[1]) {
    for (let x = xs[0]; forward ? x < w : x >= 0; x += xs[1]) {
      const i = y * w + x
      if (d[i] === 0) continue
      let v = d[i]
      for (const [dx, dy, step] of NEIGHBOR_STEPS) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        v = Math.min(v, d[ny * w + nx] + step)
      }
      d[i] = v
    }
  }
}

const NEIGHBOR_STEPS: [number, number, number][] = [
  [-1, 0, 1],
  [0, -1, 1],
  [-1, -1, 1.41],
  [1, -1, 1.41],
  [1, 0, 1],
  [0, 1, 1],
  [1, 1, 1.41],
  [-1, 1, 1.41],
]

export interface StrokeChain {
  pts: number[]
  radius: number
  /** 8-neighborhood degree at both ends: 1 = free end, ≥3 = junction */
  startDeg: number
  endDeg: number
}

interface Skeleton {
  deg: Uint8Array
  special: number[]
}

/** Degree per foreground pixel plus the list of special pixels (endpoints and junctions). */
function skeletonGraph(mask: Uint8Array, w: number, h: number): Skeleton {
  const deg = new Uint8Array(mask.length)
  const special: number[] = []
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue
    const x = i % w
    const y = (i - x) / w
    let d = 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        if (x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h && mask[i + dy * w + dx]) d++
      }
    }
    deg[i] = d
    if (d !== 2) special.push(i)
  }
  return { deg, special }
}

/** Foreground neighbor of `cur` other than `prev`, or -1. */
function nextNeighbor(mask: Uint8Array, w: number, h: number, cur: number, prev: number): number {
  const x = cur % w
  const y = (cur - x) / w
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const ni = ny * w + nx
      if (mask[ni] && ni !== prev) return ni
    }
  }
  return -1
}

/** Extract maximal skeleton chains between junction/end pixels (and closed loops without any). */
export function skeletonChains(
  mask: Uint8Array,
  w: number,
  h: number,
  dist: Float32Array,
): StrokeChain[] {
  const { deg, special } = skeletonGraph(mask, w, h)
  if (special.length === 0 && !mask.some((v) => v !== 0)) return []
  const visited = new Uint8Array(mask.length)
  const chains: StrokeChain[] = []
  const walk = (start: number, first: number): void => {
    const pts = [start % w, Math.floor(start / w)]
    let radiusSum = dist[start] ?? 0
    let count = 1
    let prev = start
    let cur = first
    let endDeg = deg[start] ?? 0
    for (;;) {
      pts.push(cur % w, Math.floor(cur / w))
      radiusSum += dist[cur] ?? 0
      count++
      visited[cur] = 1
      if (deg[cur] !== 2 || cur === start) {
        endDeg = deg[cur] ?? 0
        break
      }
      const next = nextNeighbor(mask, w, h, cur, prev)
      if (next < 0) break
      prev = cur
      cur = next
    }
    chains.push({
      pts,
      radius: count > 0 ? radiusSum / count : 0,
      startDeg: deg[start] ?? 0,
      endDeg,
    })
  }
  for (const s of special) {
    let nb = nextNeighbor(mask, w, h, s, -1)
    while (nb >= 0) {
      if (!visited[nb]) walk(s, nb)
      nb = nextNeighborAfter(mask, w, h, s, nb)
    }
  }
  if (special.length === 0) walkRing(mask, w, h, visited, walk)
  return chains
}

/** Next foreground neighbor of s strictly after `prev` in ring order (for iterating branches). */
function nextNeighborAfter(
  mask: Uint8Array,
  w: number,
  h: number,
  s: number,
  prev: number,
): number {
  const x = s % w
  const y = (s - x) / w
  const px = prev % w
  const py = Math.floor(prev / w)
  let passed = false
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const ni = ny * w + nx
      if (!mask[ni]) continue
      if (passed) return ni
      if (nx === px && ny === py) passed = true
    }
  }
  return -1
}

/** Closed skeleton without junctions (a perfect ring): one walk from any unvisited pixel. */
function walkRing(
  mask: Uint8Array,
  w: number,
  h: number,
  visited: Uint8Array,
  walk: (start: number, first: number) => void,
): void {
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || visited[i]) continue
    const nb = nextNeighbor(mask, w, h, i, -1)
    if (nb >= 0) walk(i, nb)
    return
  }
}

/** Full centerline pipeline: distance transform → thinning → chains → simplified stroke paths. */
export function traceCenterline(
  mask: Uint8Array,
  w: number,
  h: number,
  params: TraceParams,
): CenterlineResult {
  const dist = distanceTransform(mask, w, h)
  thinZhangSuen(mask, w, h)
  // Short chains drop only when they have a free end (spurs, isolated fragments); short bridges
  // between two junctions are real connectivity (e.g. a thinned ring) and must survive.
  const chains = skeletonChains(mask, w, h, dist).filter(
    (c) => c.pts.length / 2 > params.minStrokeLength || Math.min(c.startDeg, c.endDeg) !== 1,
  )
  const paths: SvgPath[] = []
  let vertices = 0
  const p = params.pathPrecision
  for (const chain of chains) {
    const simple =
      params.mode === 'none' ? chain.pts : simplifyOpen(chain.pts, params.lengthThreshold / 2)
    if (simple.length < 4) continue
    vertices += simple.length / 2
    const width = params.strokeWidth > 0 ? params.strokeWidth : Math.max(0.5, chain.radius * 2)
    paths.push({ d: strokeD(simple, params, p), stroke: '#000000', strokeWidth: width })
  }
  return { paths, vertices }
}

/** Open-chain path data: lines (polygon/none) or fitted cubics (spline). */
function strokeD(pts: number[], params: TraceParams, precision: number): string {
  const f = (v: number) => formatNum(v, precision)
  let d = `M${f(pts[0])},${f(pts[1])}`
  if (params.mode !== 'spline') {
    for (let i = 2; i < pts.length; i += 2) d += `L${f(pts[i])},${f(pts[i + 1])}`
    return d
  }
  const cubics = fitChain(pts, params.lengthThreshold / 2, params.maxIterations)
  for (let c = 0; c < cubics.length; c += 8) {
    d += `C${f(cubics[c + 2])},${f(cubics[c + 3])} ${f(cubics[c + 4])},${f(cubics[c + 5])} ${f(cubics[c + 6])},${f(cubics[c + 7])}`
  }
  return d
}
