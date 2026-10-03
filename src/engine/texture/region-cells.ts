import {
  clamp,
  emitFleck,
  fleckRotation,
  lerp,
  MAX_REGION_FLECKS,
  randNext,
  valueNoise,
} from './core'
import type { RandState } from './core'
import { htKey } from './halftone'
import { distWeight } from './patterns'
import type { RegionState, TextureCell } from './region'

/**
 * Per-cell candidate emitters of the region texture scan. The double loop in
 * `regionTextureFragments` delegates each lattice point to one of these, preserving the exact RNG
 * stream order r1..r5 while drawing lazily: rejected candidates cost one draw, and spray draws
 * s1..s3 continue the same stream only when enabled.
 */

/** Fit, don't reject: pull a candidate toward the fill center of its tile in growing steps. */
function pullToFillCenter(
  s: RegionState,
  k: number,
  fx: number,
  fy: number,
  a: number,
): [number, number] | undefined {
  const c = s.cells[k]
  const tcx = c.x + c.w / 2
  const tcy = c.y + c.h / 2
  const dl = Math.hypot(tcx - fx, tcy - fy)
  if (dl <= 1e-9) return undefined
  const ux = (tcx - fx) / dl
  const uy = (tcy - fy) / dl
  for (const m of [0.4, 0.9]) {
    const nx = fx + ux * a * m
    const ny = fy + uy * a * m
    if (s.fits(nx, ny, a)) return [nx, ny]
  }
  return undefined
}

/**
 * Distance from a point to the nearest open (disconnected) side of its cell: open sides are inset
 * by the gap margin, connected sides don't bound wear.
 */
function openEdgeDist(c: TextureCell, gapU: number, cx: number, cy: number): number {
  let d = Infinity
  if (!c.connectedL) d = Math.min(d, cx - (c.x + gapU))
  if (!c.connectedR) d = Math.min(d, c.x + c.w - gapU - cx)
  if (!c.connectedT) d = Math.min(d, cy - (c.y + gapU))
  if (!c.connectedB) d = Math.min(d, c.y + c.h - gapU - cy)
  return d
}

/** Edge reference for grunge wear: the figure silhouette in figure mode, cell sides otherwise. */
function edgeRef(s: RegionState, k: number, cx: number, cy: number): number {
  if (s.fig) return s.fig.edgeDist(cx, cy)
  return openEdgeDist(s.cells[k], s.gapU, cx, cy)
}

/** Even-scatter gate: reject a center closer than 0.8 lattice pitches to an accepted one. */
function spaced(s: RegionState, cx: number, cy: number): boolean {
  const d = 0.8 * s.Ld
  const bx = Math.floor(cx / d)
  const by = Math.floor(cy / d)
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const arr = s.taken.get((bx + ox) * 65_536 + by + oy)
      if (!arr) continue
      for (let i = 0; i < arr.length; i += 2) {
        const dx = arr[i] - cx
        const dy = arr[i + 1] - cy
        if (dx * dx + dy * dy < d * d) return false
      }
    }
  }
  const key = bx * 65_536 + by
  const arr = s.taken.get(key)
  if (arr) arr.push(cx, cy)
  else s.taken.set(key, [cx, cy])
  return true
}

/** Halftone candidate on the (optionally rotated) screen grid, plus optional spray specks. */
export function regionHalftoneCell(s: RegionState, I: number, J: number, rs: RandState): void {
  // r1..r5 keep the stream positions of the original up-front draws: r4/r5 are never read here,
  // but skipping their draws would shift the spray draws (s1..s3 = positions 6..8) and change
  // every seeded speck
  const [r1, r2, r3] = [randNext(rs), randNext(rs), randNext(rs), randNext(rs), randNext(rs)]
  const gx = I + 0.5
  const gy = J + 0.5
  let dx = (gx * s.ca - gy * s.sa) * s.Ld
  let dy = (gx * s.sa + gy * s.ca) * s.Ld
  if (s.t.jitter > 0) {
    const jx = (r1 - 0.5) * (s.t.jitter / 100) * s.Ld
    const jy = (r2 - 0.5) * (s.t.jitter / 100) * s.Ld
    dx += jx * s.ca - jy * s.sa
    dy += jx * s.sa + jy * s.ca
  }
  const kk = s.locate(dx, dy)
  if (kk === undefined) return
  let mult = 1
  if (s.t.ramp > 0) {
    const tt = clamp((dx * s.ca + dy * s.sa - s.prMin) / Math.max(s.prMax - s.prMin, 1e-9), 0, 1)
    mult *= 1 + (s.t.ramp / 100) * (2 * tt - 1)
  }
  if (s.t.variation > 0) mult *= 1 + (s.t.variation / 100) * (r3 * 2 - 1)
  const a = Math.min(s.Ld * 0.9 * s.p * Math.max(mult, 0.05), s.Ld * 0.95)
  const dropped =
    s.t.dropout > 0 &&
    valueNoise(dx / (s.Ld * 4), dy / (s.Ld * 4), s.t.seed + 77) < (s.t.dropout / 100) * 0.92
  if (a > s.Ld * 0.015 && !dropped) {
    let fx = dx
    let fy = dy
    let ok = s.fits(fx, fy, a)
    if (!ok) {
      // fit, don't reject: pull the dot toward the fill center of the tile
      const pulled = pullToFillCenter(s, kk, fx, fy, a)
      if (pulled) {
        fx = pulled[0]
        fy = pulled[1]
        ok = true
      }
    }
    if (ok) {
      const k = htKey(I, J)
      s.dotAt.set(k, s.dots.length)
      s.dotKeys.push(k)
      s.dots.push({ cx: fx + a / 2, cy: fy + a / 2, r: a / 2 })
      s.count++
    }
  }
  if (s.t.spray > 0 && s.dots.length + s.sprayCand.length < MAX_REGION_FLECKS) {
    const s1 = randNext(rs)
    const s2 = randNext(rs)
    const s3 = randNext(rs)
    if (s1 < (s.t.spray / 100) * 0.6) {
      // keep the speck within the middle half of the cell so sprays from
      // adjacent cells can never touch each other (they would XOR)
      const wi = I + 0.25 + s2 * 0.5
      const wj = J + 0.25 + s3 * 0.5
      const sx = (wi * s.ca - wj * s.sa) * s.Ld
      const sy = (wi * s.sa + wj * s.ca) * s.Ld
      const sr = s.Ld * (0.025 + 0.055 * ((s2 + s3) / 2))
      if (s.fits(sx - sr, sy - sr, sr * 2)) {
        s.sprayCand.push({ cx: sx, cy: sy, r: sr, key: htKey(I, J) })
      }
    }
  }
}

/** Scatter/grunge candidate: distribution weight, size, jitter and fit-pull, then fleck emission. */
export function regionScatterCell(s: RegionState, I: number, J: number, rs: RandState): void {
  const cx = (I + 0.5) * s.Ld
  const cy = (J + 0.5) * s.Ld
  const r1 = randNext(rs)
  // every distWeight branch clamps to ≤ 1, so r1 ≥ p·keep rejects for any weight — the cheap
  // bound test spares the noise field (up to 12 hash draws) on almost every rejected node, and
  // acceptance is byte-identical to computing the weight first
  if (r1 >= s.p * s.keep) return
  const k = s.locate(cx, cy)
  if (k === undefined) return
  let weight = distWeight(s.t, cx, cy, s.Ld, s.dc)
  if (s.t.effect === 'grunge') {
    const od = Math.min(1, edgeRef(s, k, cx, cy) / s.band)
    weight *= clamp(1 + 0.5 * s.e - (0.5 + 0.5 * s.e) * od, s.minW, 1)
  }
  if (r1 >= s.p * weight * s.keep) return
  // stream order r1..r5 preserved: the rest are drawn only for accepted candidates
  const r2 = randNext(rs)
  const r3 = randNext(rs)
  const r4 = randNext(rs)
  const r5 = randNext(rs)
  // speck bounding box: size range plus an edge-wear bonus for grunge
  let a: number = lerp(s.t.sizeMin, s.t.sizeMax, r3) * s.Ld
  if (s.t.effect === 'grunge') {
    a *= 1 + 0.35 * (1 - Math.min(1, edgeRef(s, k, cx, cy) / s.band))
  }
  a = Math.min(a, 0.6 * s.Ld)
  const jx = (r2 - 0.5) * (s.Ld - a) * 0.95
  const jy = (r4 - 0.5) * (s.Ld - a) * 0.95
  let fx = cx + jx
  let fy = cy + jy
  if (!s.fits(fx, fy, a)) {
    // fit, don't reject: pull the speck toward the fill center of the tile
    // it sits in, so corner-adjacent candidates survive rounding
    const pulled = pullToFillCenter(s, k, fx, fy, a)
    if (!pulled) return
    fx = pulled[0]
    fy = pulled[1]
  }
  if (s.even && !spaced(s, fx + a / 2, fy + a / 2)) return
  s.out += emitFleck(s.t.shape, fx, fy, a, fleckRotation(s.t.shape, s.t.angle, r5))
  s.count++
}
