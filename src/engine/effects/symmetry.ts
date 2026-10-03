import type { SymmetryState } from '../core/doc'
import type { RadialOpts } from './symmetry-radial.ts'
import { foldCount, inFilledWedge, twistRad } from './symmetry-radial.ts'
import { isRepeat, repeatDef, repeatPoints } from './symmetry-repeat.ts'

export type SymMode = SymmetryState['mode']

export {
  WALLPAPER_MODES,
  TILING_MODES,
  REPEAT_MODES,
  isRepeat,
  repeatDef,
  type RepeatDef,
} from './symmetry-repeat.ts'
export { angleInFilledWedge, type RadialOpts } from './symmetry-radial.ts'

export const MIN_CELL = 4
export const MAX_CELL = 64

/**
 * Map one buffer point through the active symmetry mode. Returns unique in-bounds points (the
 * original always included) — or an empty list when the radial sector gate rejects the point
 * (nothing is painted outside the filled wedge). `cell` is the repeat lattice size in buffer cells
 * (repeat modes only).
 */
export function symmetryPoints(
  x: number,
  y: number,
  bw: number,
  bh: number,
  mode: SymMode,
  n: number,
  cell: number = 16,
  radial?: RadialOpts,
  /** Hard cap on returned points (repeat lattices can enumerate thousands of copies). */
  limit: number = Infinity,
): [number, number][] {
  if (mode === 'none') return [[x, y]]
  if ((mode === 'radial' || mode === 'kaleido') && !inFilledWedge(x, y, bw, bh, n, radial)) {
    return []
  }
  const out: [number, number][] = [[x, y]]
  const seen = new Set<number>([y * bw + x])
  const push = (px: number, py: number) => {
    if (px >= 0 && py >= 0 && px < bw && py < bh && !seen.has(py * bw + px)) {
      seen.add(py * bw + px)
      out.push([px, py])
    }
  }

  const def = isRepeat(mode) ? repeatDef(mode) : null
  if (def) {
    repeatPoints(x, y, bw, bh, def, Math.max(2, Math.min(cell, bw, bh)), seen, push, limit)
    return out
  }

  const mx = bw - 1 - x
  const my = bh - 1 - y

  switch (mode) {
    case 'mirrorX': {
      push(mx, y)
      break
    }
    case 'mirrorY': {
      push(x, my)
      break
    }
    case 'quad': {
      push(mx, y)
      push(x, my)
      push(mx, my)
      break
    }
    case 'diag8': {
      push(mx, y)
      push(x, my)
      push(mx, my)
      push(y, x)
      push(y, mx)
      push(my, x)
      push(my, mx)
      break
    }
    case 'radial':
    case 'kaleido': {
      const cx = (bw - 1) / 2
      const cy = (bh - 1) / 2
      let dx = x - cx
      let dy = y - cy
      const tw = twistRad(radial) * Math.hypot(dx, dy)
      if (tw) {
        const tc = Math.cos(tw)
        const ts = Math.sin(tw)
        const nx = dx * tc - dy * ts
        dy = dx * ts + dy * tc
        dx = nx
      }
      const fold = foldCount(n)
      const sources: [number, number][] =
        mode === 'kaleido'
          ? [
              [dx, dy],
              [-dx, dy],
            ]
          : [[dx, dy]]
      for (let k = 0; k < fold; k++) {
        const a = (k * 2 * Math.PI) / fold
        const cos = Math.cos(a)
        const sin = Math.sin(a)
        for (const [sx, sy] of sources) {
          push(Math.round(cx + sx * cos - sy * sin), Math.round(cy + sx * sin + sy * cos))
        }
      }
      break
    }
  }
  return out
}

/** Clamp a stored repeat-cell size to the valid range. */
export function clampCell(v: unknown, fallback = 16): number {
  const n = Math.round(Number(v) || fallback)
  return Math.max(MIN_CELL, Math.min(MAX_CELL, n))
}

/** Point map of one symmetry copy, in buffer coordinates. */
export type SymTransform = (x: number, y: number) => [number, number]

/**
 * Angle maps (about the canvas center) of the non-identity copies of the finite modes, for lattices
 * without buffer-space mirrors (hex/triangle/radial). Angles use canvas coordinates (y grows
 * downward). Each map takes the center-relative angle and radius (the radius matters only for the
 * radial twist). The axes match the square-grid buffer math and the drawn guides: mirrorX reflects
 * across the vertical axis (left↔right, θ → π−θ), mirrorY across the horizontal axis (top↔bottom, θ
 * → −θ); kaleido mirrors across the vertical axis like the square-grid sources [[dx,dy],
 * [−dx,dy]].
 */
export function polarAngleMaps(
  mode: SymMode,
  n: number,
  radial?: RadialOpts,
): ((a: number, r: number) => number)[] {
  const tw = twistRad(radial)
  switch (mode) {
    case 'mirrorX': {
      return [(a) => Math.PI - a]
    }
    case 'mirrorY': {
      return [(a) => -a]
    }
    case 'quad': {
      return [(a) => Math.PI - a, (a) => -a, (a) => Math.PI + a]
    }
    case 'diag8': {
      return [
        (a) => Math.PI - a,
        (a) => -a,
        (a) => Math.PI / 2 - a,
        (a) => -Math.PI / 2 - a,
        (a) => a + Math.PI / 2,
        (a) => a + Math.PI,
        (a) => a + (3 * Math.PI) / 2,
      ]
    }
    case 'radial':
    case 'kaleido': {
      const fold = foldCount(n)
      const out: ((a: number, r: number) => number)[] = []
      for (let k = 1; k < fold; k++) out.push((a, r) => a + (k * 2 * Math.PI) / fold + tw * r)
      if (mode === 'kaleido') out.push((a, r) => Math.PI - a + tw * r)
      return out
    }
    default: {
      return []
    }
  }
}

/**
 * Point-map for every symmetry copy of the finite modes (mirrors, quad, diag8, radial, kaleido).
 * Shapes map their defining points through each transform and re-rasterize, so every copy is a
 * correctly drawn shape instead of a mirrored raster. Combine with the untransformed shape and
 * dedupe results; radial/kaleido include the k=0 identity map, mirror modes do not. Returns null
 * for `none` and repeat/wallpaper modes — those have no per-copy endpoint map and keep per-point
 * orbit expansion via `symmetryPoints`.
 */
export function symmetryTransforms(
  bw: number,
  bh: number,
  mode: SymMode,
  n: number,
  radial?: RadialOpts,
): SymTransform[] | null {
  const cx = (bw - 1) / 2
  const cy = (bh - 1) / 2
  const tw = twistRad(radial)
  const rot =
    (cos: number, sin: number, flipDx: boolean): SymTransform =>
    (x, y) => {
      let dx = flipDx ? -(x - cx) : x - cx
      let dy = y - cy
      if (tw) {
        const ta = tw * Math.hypot(dx, dy)
        const tc = Math.cos(ta)
        const ts = Math.sin(ta)
        const nx = dx * tc - dy * ts
        dy = dx * ts + dy * tc
        dx = nx
      }
      return [Math.round(cx + dx * cos - dy * sin), Math.round(cy + dx * sin + dy * cos)]
    }
  const mx = (x: number) => bw - 1 - x
  const my = (y: number) => bh - 1 - y
  switch (mode) {
    case 'mirrorX': {
      return [(x, y) => [mx(x), y]]
    }
    case 'mirrorY': {
      return [(x, y) => [x, my(y)]]
    }
    case 'quad': {
      return [(x, y) => [mx(x), y], (x, y) => [x, my(y)], (x, y) => [mx(x), my(y)]]
    }
    case 'diag8': {
      return [
        (x, y) => [mx(x), y],
        (x, y) => [x, my(y)],
        (x, y) => [mx(x), my(y)],
        (x, y) => [y, x],
        (x, y) => [y, mx(x)],
        (x, y) => [my(y), x],
        (x, y) => [my(y), mx(x)],
      ]
    }
    case 'radial':
    case 'kaleido': {
      const fold = foldCount(n)
      const out: SymTransform[] = []
      for (let k = 0; k < fold; k++) {
        const a = (k * 2 * Math.PI) / fold
        const cos = Math.cos(a)
        const sin = Math.sin(a)
        out.push(rot(cos, sin, false))
        if (mode === 'kaleido') out.push(rot(cos, sin, true))
      }
      return out
    }
    default: {
      return null
    }
  }
}

/**
 * Copies of a directed endpoint pair (a, b) under symmetry: both endpoints are always mapped by the
 * same operation, so mirrored/rotated connectors stay connected. Includes the original pair first;
 * every returned copy is fully in bounds.
 */
export function symmetryPairPoints(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  mode: SymMode,
  n: number,
  cell: number = 16,
  radial?: RadialOpts,
): [number, number, number, number][] {
  const inB = (px: number, py: number) => px >= 0 && py >= 0 && px < bw && py < bh
  const out: [number, number, number, number][] = [[ax, ay, bx, by]]
  const seen = new Set<string>([`${ax},${ay}`])

  const def = isRepeat(mode) ? repeatDef(mode) : null
  if (def) {
    const c = Math.max(2, Math.min(cell, bw, bh))
    const [AAx, AAy] = def.A
    const [ABx, ABy] = def.B
    const det = (AAx * ABy - AAy * ABx) * c * c
    const fracU = (px: number, py: number) => (ABy * c * px - ABx * c * py) / det
    const fracV = (px: number, py: number) => (AAx * c * py - AAy * c * px) / det
    const toPx = (u: number, v: number): [number, number] => [
      Math.round((u * AAx + v * ABx) * c),
      Math.round((u * AAy + v * ABy) * c),
    ]
    // canvas bounds in lattice-fractional coordinates
    let uMin = Infinity
    let uMax = -Infinity
    let vMin = Infinity
    let vMax = -Infinity
    for (const [cx, cy] of [
      [0, 0],
      [bw, 0],
      [0, bh],
      [bw, bh],
    ]) {
      const u = fracU(cx, cy)
      const v = fracV(cx, cy)
      uMin = Math.min(uMin, u)
      uMax = Math.max(uMax, u)
      vMin = Math.min(vMin, v)
      vMax = Math.max(vMax, v)
    }
    const [cu, cv] = def.centering ?? [0, 0]
    const centered = def.centering ? 2 : 1
    for (const { m, f } of def.ops) {
      const au = fracU(ax, ay)
      const av = fracV(ax, ay)
      const bu = fracU(bx, by)
      const bv = fracV(bx, by)
      const u1 = m[0] * au + m[1] * av + f[0]
      const v1 = m[2] * au + m[3] * av + f[1]
      const u1b = m[0] * bu + m[1] * bv + f[0]
      const v1b = m[2] * bu + m[3] * bv + f[1]
      for (let k = 0; k < centered; k++) {
        const uc = u1 + k * cu
        const vc = v1 + k * cv
        const ucb = u1b + k * cu
        const vcb = v1b + k * cv
        const iLo = Math.floor(uMin - uc) - 1
        const iHi = Math.ceil(uMax - uc) + 1
        const jLo = Math.floor(vMin - vc) - 1
        const jHi = Math.ceil(vMax - vc) + 1
        for (let i = iLo; i <= iHi; i++) {
          for (let j = jLo; j <= jHi; j++) {
            // cap the copies so a tiny repeat lattice cannot flood the link list
            if (out.length >= 256) return out
            const [px, py] = toPx(uc + i, vc + j)
            const [qx, qy] = toPx(ucb + i, vcb + j)
            if (!inB(px, py) || !inB(qx, qy)) continue
            const key = `${px},${py}`
            if (seen.has(key)) continue
            seen.add(key)
            out.push([px, py, qx, qy])
          }
        }
      }
    }
    return out
  }

  const transforms = symmetryTransforms(bw, bh, mode, n, radial)
  if (transforms) {
    for (const t of transforms) {
      const [px, py] = t(ax, ay)
      const [qx, qy] = t(bx, by)
      const key = `${px},${py}`
      if (inB(px, py) && inB(qx, qy) && !seen.has(key)) {
        seen.add(key)
        out.push([px, py, qx, qy])
      }
    }
  }
  return out
}
