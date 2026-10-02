/**
 * Line systems: parallel screen lines over a box (straight or waved), the clip-and-emit scanner
 * that turns sampled lines into constant-width filled-outline strips against a caller-supplied
 * inside test, the strip→even-odd path emitter and the analytic distance-to-centerline used by the
 * hatch node's O(1) coverage test. Pure.
 */

import type { Pt } from './marching-squares.ts'
import { fmt } from './texture-core.ts'

/** One parallel line system: direction, spacing and the optional positional wave. */
export interface HatchSystem {
  /** Line direction in degrees (0 = horizontal lines, texture.angle convention) */
  angle: number
  /** Distance between line centerlines */
  spacing: number
  /** Offset of the line family along the normal */
  phase: number
  /** Wave amplitude along the normal (0 = straight lines) */
  waveAmp: number
  /** Wavelength along the line direction */
  waveLen: number
}

/** Unit direction and normal of a system angle. */
interface Basis {
  dx: number
  dy: number
  nx: number
  ny: number
}

function basis(angleDeg: number): Basis {
  const rad = (angleDeg * Math.PI) / 180
  const dx = Math.cos(rad)
  const dy = Math.sin(rad)
  return { dx, dy, nx: -dy, ny: dx }
}

/** The wave term of a system at along-line parameter `t` (shared by sampling and coverage). */
function waveAt(sys: HatchSystem, t: number): number {
  return sys.waveAmp > 0 && sys.waveLen > 0
    ? sys.waveAmp * Math.sin((t * 2 * Math.PI) / sys.waveLen)
    : 0
}

/** Centerline point of line `u` at along-line parameter `t` (wave applied along the normal). */
function pointAt(sys: HatchSystem, b: Basis, u: number, t: number): Pt {
  const wave = waveAt(sys, t)
  return { x: b.nx * (u + wave) + b.dx * t, y: b.ny * (u + wave) + b.dy * t }
}

/**
 * Distance from (x, y) to the nearest centerline of the system — the wave included, so the node
 * coverage test and the sampled geometry agree by construction: a line of nominal offset u sits at
 * u + wave(t), which makes the query's nominal offset u − wave(t).
 */
export function hatchDistance(sys: HatchSystem, x: number, y: number): number {
  const b = basis(sys.angle)
  const u = x * b.nx + y * b.ny
  const t = x * b.dx + y * b.dy
  const sp = Math.max(sys.spacing, 1e-3)
  const uu = u - waveAt(sys, t) - sys.phase
  const m = uu - Math.floor(uu / sp) * sp
  return Math.min(m, sp - m)
}

/** Clip-and-emit contract: lines are sampled, tested and emitted as strips. */
export interface HatchScan {
  /** Box the lines must cover: [ox, ox + w) × [oy, oy + h) in caller coordinates */
  ox: number
  oy: number
  w: number
  h: number
  /** The line system to scan */
  system: HatchSystem
  /** Full line width for the line family member k at nominal offset u */
  widthAt: (u: number, k: number) => number
  /** Optional per-line phase jitter along the normal */
  jitterAt?: (k: number) => number
  /** Clip test: is a square of half-size hw at (x, y) inside the ink? */
  inside: (x: number, y: number, hw: number) => boolean
  /** Sampling resolution in the along-line direction (feature size to resolve) */
  step: number
  /** Coarsen spacing until at most this many lines are scanned */
  maxLines: number
  /** Stop after this many emitted strips (path-size budget) */
  maxRuns: number
}

/**
 * Fragments of one line system clipped by `inside`: every maximal inside run becomes one
 * constant-width filled-outline strip. Straight runs collapse to their two refined endpoints; waved
 * runs keep their samples. Deterministic; bounded by maxLines/maxRuns.
 */
export function hatchFragments(scan: HatchScan): string {
  const { system: sys } = scan
  const b = basis(sys.angle)
  const sp = Math.max(sys.spacing, 1e-3)
  const corners = [
    [scan.ox, scan.oy],
    [scan.ox + scan.w, scan.oy],
    [scan.ox, scan.oy + scan.h],
    [scan.ox + scan.w, scan.oy + scan.h],
  ]
  let uMin = Infinity
  let uMax = -Infinity
  let tMin = Infinity
  let tMax = -Infinity
  for (const [cx, cy] of corners) {
    const u = cx * b.nx + cy * b.ny
    const t = cx * b.dx + cy * b.dy
    uMin = Math.min(uMin, u)
    uMax = Math.max(uMax, u)
    tMin = Math.min(tMin, t)
    tMax = Math.max(tMax, t)
  }
  const diag = Math.hypot(scan.w, scan.h)
  // one spacing of slack covers the widthAt range and per-line jitter
  const kStart = Math.ceil((uMin - sys.phase - sp) / sp)
  const kEnd = Math.floor((uMax - sys.phase + sp) / sp)
  const total = kEnd - kStart + 1
  const lineStride = total > scan.maxLines ? Math.ceil(total / scan.maxLines) : 1
  const step = Math.max(scan.step, 1e-3)
  let out = ''
  let runs = 0
  for (let k = kStart; k <= kEnd && runs < scan.maxRuns; k += lineStride) {
    const u = sys.phase + k * sp + (scan.jitterAt ? scan.jitterAt(k) : 0)
    const hw = scan.widthAt(u, k) / 2
    if (hw <= 0.01) continue
    const walk: LineWalk = {
      sys,
      b,
      u,
      test: (t) => {
        const p = pointAt(sys, b, u, t)
        return scan.inside(p.x, p.y, hw)
      },
    }
    for (const run of lineRuns(walk, tMin - diag, tMax + diag, step)) {
      out += stripPath(run, hw)
      runs++
      if (runs >= scan.maxRuns) break
    }
  }
  return out
}

/** Per-line walk context: one centerline, its clip test and sampling resolution. */
interface LineWalk {
  sys: HatchSystem
  b: Basis
  u: number
  test: (t: number) => boolean
}

/** Last sample with the old status right before the flip between `a` and `b` (bisection). */
function flipPoint(walk: LineWalk, a: number, keep: boolean, b: number): number {
  let lo = a
  let hi = b
  for (let i = 0; i < 6; i++) {
    const mid = (lo + hi) / 2
    if (walk.test(mid) === keep) lo = mid
    else hi = mid
  }
  return keep ? lo : hi
}

/** Maximal inside intervals of one line: refined endpoints, samples kept for waved lines. */
function lineRuns(walk: LineWalk, tMin: number, tMax: number, step: number): Pt[][] {
  const { sys, b, u } = walk
  const waved = sys.waveAmp > 0
  const at = (t: number): Pt => pointAt(sys, b, u, t)
  const runs: Pt[][] = []
  const emit = (pts: Pt[]): void => {
    if (pts.length >= 2) runs.push(pts)
  }
  let cur: Pt[] | null = null
  let prev = walk.test(tMin)
  if (prev) cur = [at(tMin)]
  let t = tMin
  while (t < tMax) {
    const next = Math.min(t + step, tMax)
    const now = walk.test(next)
    if (now !== prev) {
      const edge = at(flipPoint(walk, t, prev, next))
      if (cur) emit(waved ? [...cur, edge] : [cur[0], edge])
      cur = prev ? null : [edge]
      prev = now
    } else if (prev && cur && waved) {
      cur.push(at(next))
    }
    t = next
  }
  if (prev && cur) emit(waved ? [...cur, at(tMax)] : [cur[0], at(tMax)])
  return runs
}

/**
 * Filled outline of a constant-width strip through the points: offsets ±hw along averaged segment
 * normals, flat caps. One closed evenodd subpath — never a self-XOR.
 */
export function stripPath(pts: readonly Pt[], hw: number): string {
  const n = pts.length
  if (!(hw > 0) || n < 2) return ''
  const norm = (ax: number, ay: number): [number, number] | null => {
    const len = Math.hypot(ax, ay)
    if (len < 1e-9) return null
    return [-ay / len, ax / len]
  }
  const offs: [number, number][] = []
  for (let i = 0; i < n; i++) {
    let nx = 0
    let ny = 0
    const a = i > 0 ? norm(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) : null
    const b = i < n - 1 ? norm(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y) : null
    if (a) {
      nx += a[0]
      ny += a[1]
    }
    if (b) {
      nx += b[0]
      ny += b[1]
    }
    if (!a && !b) return ''
    const len = Math.hypot(nx, ny)
    offs.push(len < 1e-9 ? (a as [number, number]) : [nx / len, ny / len])
  }
  let d = ''
  for (const side of [1, -1] as const) {
    for (let i = 0; i < n; i++) {
      const j = side === 1 ? i : n - 1 - i
      const p = pts[j]
      const o = offs[j]
      d += `${side === 1 && i === 0 ? 'M' : 'L'}${fmt(p.x + o[0] * hw * side)} ${fmt(p.y + o[1] * hw * side)}`
    }
  }
  return `${d}Z`
}
