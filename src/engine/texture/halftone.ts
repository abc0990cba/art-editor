import { DEFAULT_SHAPE_PARAMS, type CellShapeId } from '../cell-shapes/defs.ts'
import { cellShapeFragment } from '../cell-shapes/frag.ts'
import type { TextureSettings, TextureShape } from '../core/doc'
import { circleFleck, fmt, hash2, valueNoise } from './core'

/** Cell-form silhouette behind every texture shape; undefined keeps the classic circle. */
const TEXTURE_MARK_FORM: Partial<Record<TextureShape, CellShapeId>> = {
  square: 'square',
  chip: 'square',
  triangle: 'triangle',
  diamond: 'diamond',
  cross: 'cross',
  star: 'star',
  hex: 'hexagon',
  ring: 'ring',
  dash: 'capsule',
}

/**
 * Halftone distress machinery: candidate dots collected by the region/field scanners are fused,
 * wobbled and emitted here. Touching/overlapping dots become single evenodd subpaths, so merged
 * blobs never XOR against their own halves.
 */

/** One candidate halftone dot: circle center + radius, in doc units. */
export interface HtDot {
  cx: number
  cy: number
  r: number
}

/** Max radius deviation as a share of r at wobble 100. */
const HT_WOBBLE_AMP = 0.42

/** Packed signed grid key: 16 bits per axis around a 0x8000 bias. */
export const htKey = (i: number, j: number) => (i + 0x80_00) * 0x1_00_00 + (j + 0x80_00)

/** Closed smooth polygon through `pts` (midpoint quadratic spline). */
function smoothClosedPath(pts: [number, number][]): string {
  const n = pts.length
  const mx = (a: [number, number], b: [number, number]) => fmt((a[0] + b[0]) / 2)
  const my = (a: [number, number], b: [number, number]) => fmt((a[1] + b[1]) / 2)
  let d = `M${mx(pts[n - 1], pts[0])} ${my(pts[n - 1], pts[0])}`
  for (let i = 0; i < n; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % n]
    d += `Q${fmt(p[0])} ${fmt(p[1])} ${mx(p, q)} ${my(p, q)}`
  }
  return `${d}z`
}

/** Single wobbled circle: noise perturbation sampled on a circular route, so it closes. */
function wobblyCirclePath(cx: number, cy: number, r: number, amp: number, seed: number): string {
  const K = 12
  const pts: [number, number][] = []
  for (let k = 0; k < K; k++) {
    const a = (k / K) * Math.PI * 2
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    const w = (valueNoise(ca * 1.7 + cx * 0.61, sa * 1.7 + cy * 0.61, seed) - 0.5) * 2 * amp
    const rr = Math.max(r * 0.2, r * (1 + w))
    pts.push([cx + ca * rr, cy + sa * rr])
  }
  return smoothClosedPath(pts)
}

/**
 * Star-shaped union of an overlapping dot cluster as one blob outline: for K rays from a pole
 * (area-weighted centroid, falling back to the largest dot's center so every ray hits something)
 * take the farthest circle intersection. Chords cut concave waists inward, so the blob never
 * under-covers the merged dots much and always stays a simple polygon (evenodd-safe as a single
 * subpath).
 */
function clusterBlobPath(cluster: HtDot[], amp: number, seed: number): string {
  let w = 0
  let gx = 0
  let gy = 0
  let big = cluster[0]
  for (const d of cluster) {
    const a = d.r * d.r
    w += a
    gx += d.cx * a
    gy += d.cy * a
    if (d.r > big.r) big = d
  }
  gx /= w
  gy /= w
  if (!cluster.some((d) => (d.cx - gx) ** 2 + (d.cy - gy) ** 2 <= d.r * d.r)) {
    gx = big.cx
    gy = big.cy
  }
  const K = Math.min(32, 10 + cluster.length * 6)
  const pts: [number, number][] = []
  for (let k = 0; k < K; k++) {
    const a = (k / K) * Math.PI * 2
    const ux = Math.cos(a)
    const uy = Math.sin(a)
    let best = 0
    for (const d of cluster) {
      const px = d.cx - gx
      const py = d.cy - gy
      const proj = ux * px + uy * py
      const disc = proj * proj - (px * px + py * py - d.r * d.r)
      if (disc < 0) continue
      const t = proj + Math.sqrt(disc)
      if (t > best) best = t
    }
    let rr = best
    if (amp > 0 && rr > 0) {
      const wn = (valueNoise(ux * 2.3 + gx * 0.57, uy * 2.3 + gy * 0.57, seed) - 0.5) * 2 * amp
      rr = Math.max(rr * 0.55, rr * (1 + wn))
    }
    pts.push([gx + ux * rr, gy + uy * rr])
  }
  return smoothClosedPath(pts)
}

/** Dots accumulated by a scanner: candidates, their packed grid keys and the key lookup. */
export interface CollectedDots {
  dots: HtDot[]
  keys: number[]
  dotAt: Map<number, number>
}

/** One isolated dot: the configured silhouette, or a plain / wobbled circle. */
function singleDotPath(t: TextureSettings, d: HtDot, amp: number): string {
  const form = TEXTURE_MARK_FORM[t.shape]
  if (!form) {
    return amp > 0 ? wobblyCirclePath(d.cx, d.cy, d.r, amp, t.seed) : circleFleck(d.cx, d.cy, d.r)
  }
  const chip = t.shape === 'chip'
  return cellShapeFragment({
    id: form,
    x: d.cx - d.r,
    y: d.cy - d.r,
    w: d.r * 2,
    h: d.r * 2,
    params: chip ? { ...DEFAULT_SHAPE_PARAMS, thickness: 0.5 } : DEFAULT_SHAPE_PARAMS,
    radius: chip ? d.r * 0.6 : 0,
    chamfer: false,
  })
}

/**
 * Emit collected halftone dots. Singletons stay plain circles (or wobbled ones); grid neighbors
 * whose circles touch or overlap — or come within the merge neck — fuse into one star-union blob
 * each, so merged dots are a single evenodd subpath and never XOR against their own halves.
 * `stride` is the placement grid step the caller scanned with; adjacency is checked right/down at
 * that step.
 */
export function emitHalftoneDots(
  collected: CollectedDots,
  stride: number,
  t: TextureSettings,
  pitch: number,
): string {
  const { dots, keys, dotAt } = collected
  const n = dots.length
  if (n === 0) return ''
  const parent = new Int32Array(n)
  const size = new Int32Array(n).fill(1)
  for (let i = 0; i < n; i++) parent[i] = i
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  const unite = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra === rb) return
    parent[ra] = rb
    size[rb] += size[ra]
  }
  // touching/overlapping dots must fuse (a lone overlap would XOR against its
  // twin under evenodd); the extra "ink bleed" neck is optional and gated by the
  // merge slider, and only ever joins two single dots, so blobs stay dot-scale
  const mergeP = t.merge / 100
  const neck = mergeP * 0.55 * pitch
  for (let i = 0; i < n; i++) {
    const ki = keys[i]
    for (const nk of [ki + stride * 0x1_00_00, ki + stride]) {
      const j = dotAt.get(nk)
      if (j === undefined) continue
      const d = Math.hypot(dots[j].cx - dots[i].cx, dots[j].cy - dots[i].cy)
      if (d <= dots[i].r + dots[j].r) {
        unite(i, j)
        continue
      }
      const ri = find(i)
      const rj = find(j)
      if (
        neck > 0 &&
        d <= dots[i].r + dots[j].r + neck &&
        ri !== rj &&
        size[ri] === 1 &&
        size[rj] === 1 &&
        hash2(Math.min(ki, nk), Math.max(ki, nk), t.seed + 991) / 4_294_967_296 < mergeP
      ) {
        unite(ri, rj)
      }
    }
  }
  const clusters = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const root = find(i)
    const list = clusters.get(root)
    if (list) list.push(i)
    else clusters.set(root, [i])
  }
  const amp = (t.wobble / 100) * HT_WOBBLE_AMP
  let out = ''
  for (const [root, list] of clusters) {
    if (list.length === 1) {
      out += singleDotPath(t, dots[list[0]], amp)
    } else {
      out += clusterBlobPath(
        list.map((i) => dots[i]),
        amp,
        (t.seed + root) | 0,
      )
    }
  }
  return out
}

/** Spray specks that would land on (or inside) a dot are dropped, not XORed. */
export function filterSpray(
  spray: (HtDot & { key: number })[],
  dots: HtDot[],
  dotAt: Map<number, number>,
  pitch: number,
): string {
  const clearance = dots.length > 0 ? pitch * 0.08 : 0
  let out = ''
  for (const s of spray) {
    let ok = true
    for (let di = -1; di <= 1 && ok; di++) {
      for (let dj = -1; dj <= 1 && ok; dj++) {
        const j = dotAt.get(s.key + di * 0x1_00_00 + dj)
        if (j === undefined) continue
        if (Math.hypot(dots[j].cx - s.cx, dots[j].cy - s.cy) < dots[j].r + s.r + clearance)
          ok = false
      }
    }
    if (ok) out += circleFleck(s.cx, s.cy, s.r)
  }
  return out
}
