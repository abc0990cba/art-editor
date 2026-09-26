import { clamp, distWeight, emitFleck, lerp, MAX_REGION_FLECKS, valueNoise } from './texture-core'
import { htKey } from './texture-halftone'
import type { CellRand, RegionBounds, RegionState, TextureCell } from './texture-region'

/**
 * Per-cell candidate emitters of the region texture scan. The double loop in
 * `regionTextureFragments` delegates each lattice point to one of these, preserving the exact RNG
 * draw order: the caller draws r1..r5 up front (both branches consume them), halftone spray draws
 * s1..s3 only when enabled.
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

/** Distance from a point to the nearest open (disconnected) side of its cell. */
function openEdgeDist(c: TextureCell, b: RegionBounds, cx: number, cy: number): number {
  let d = Infinity
  if (!c.connectedL) d = Math.min(d, cx - b.left)
  if (!c.connectedR) d = Math.min(d, b.right - cx)
  if (!c.connectedT) d = Math.min(d, cy - b.top)
  if (!c.connectedB) d = Math.min(d, b.bottom - cy)
  return d
}

/** Halftone candidate on the (optionally rotated) screen grid, plus optional spray specks. */
export function regionHalftoneCell(
  s: RegionState,
  I: number,
  J: number,
  r: CellRand,
  rand: () => number,
): void {
  const gx = I + 0.5
  const gy = J + 0.5
  let dx = (gx * s.ca - gy * s.sa) * s.Ld
  let dy = (gx * s.sa + gy * s.ca) * s.Ld
  if (s.t.jitter > 0) {
    const jx = (r.r1 - 0.5) * (s.t.jitter / 100) * s.Ld
    const jy = (r.r2 - 0.5) * (s.t.jitter / 100) * s.Ld
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
  if (s.t.variation > 0) mult *= 1 + (s.t.variation / 100) * (r.r3 * 2 - 1)
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
    const s1 = rand()
    const s2 = rand()
    const s3 = rand()
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
export function regionScatterCell(s: RegionState, I: number, J: number, r: CellRand): void {
  const cx = (I + 0.5) * s.Ld
  const cy = (J + 0.5) * s.Ld
  const k = s.locate(cx, cy)
  if (k === undefined) return
  let weight = distWeight(s.t, cx, cy, s.Ld)
  if (s.t.effect === 'grunge') {
    weight *= clamp(
      1 +
        0.5 * s.e -
        (0.5 + 0.5 * s.e) * Math.min(1, openEdgeDist(s.cells[k], s.bounds[k], cx, cy) / s.band),
      s.minW,
      1,
    )
  }
  if (r.r1 >= s.p * weight * s.keep) return
  // speck bounding box: size range plus an edge-wear bonus for grunge
  let a: number = lerp(s.t.sizeMin, s.t.sizeMax, r.r3) * s.Ld
  if (s.t.effect === 'grunge') {
    a *= 1 + 0.35 * (1 - Math.min(1, openEdgeDist(s.cells[k], s.bounds[k], cx, cy) / s.band))
  }
  a = Math.min(a, 0.6 * s.Ld)
  const jx = (r.r2 - 0.5) * (s.Ld - a) * 0.95
  const jy = (r.r4 - 0.5) * (s.Ld - a) * 0.95
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
  s.out += emitFleck(s.t.shape, fx, fy, a, s.t.shape === 'chip' ? r.r5 * (Math.PI / 2) : 0)
  s.count++
}
