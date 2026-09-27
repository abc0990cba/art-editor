/**
 * Path-data building and SVG assembly — the vtracer V1 output stage. A simplified closed loop
 * becomes polygon data (mode polygon/none) or cubic splines (mode spline): vertices turning harder
 * than `cornerThreshold` split chains as hard corners (independent one-sided tangents), turns above
 * `spliceThreshold` but below the corner threshold split as soft anchors (shared center tangent, so
 * the curve passes through smoothly), everything else is fit material. `composeSvg` stacks the
 * finished paths painter-style with an optional <defs> hook.
 */

import { fitChain, turnDeg, type Tangent } from './fit-curves.ts'
import type { TraceParams } from './params.ts'

export interface SvgPath {
  d: string
  fill?: string
  stroke?: string
  strokeWidth?: number
}

/** Format a coordinate with `precision` decimals, trimming trailing zeros. */
export function formatNum(v: number, precision: number): string {
  let s = v.toFixed(precision)
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '')
  return s === '-0' ? '0' : s
}

const fmt = formatNum

/** Build the path data for one closed, already-simplified loop. */
export function loopToPath(pts: number[], params: TraceParams): string {
  const p = params.pathPrecision
  if (params.mode !== 'spline') return polygonD(pts, p)
  return splineD(pts, params, p)
}

function polygonD(pts: number[], precision: number): string {
  const parts: string[] = [`M${fmt(pts[0], precision)},${fmt(pts[1], precision)}`]
  for (let i = 2; i < pts.length; i += 2) {
    parts.push(`L${fmt(pts[i], precision)},${fmt(pts[i + 1], precision)}`)
  }
  return `${parts.join('')}Z`
}

function splineD(pts: number[], params: TraceParams, precision: number): string {
  const n = pts.length / 2
  const forced = forcedAnchors(pts, params)
  const at = (i: number): number[] => [pts[(i % n) * 2], pts[(i % n) * 2 + 1]]
  const epsilon = params.lengthThreshold / 2
  let d = `M${fmt(at(forced[0])[0], precision)},${fmt(at(forced[0])[1], precision)}`
  for (let f = 0; f < forced.length; f++) {
    const a = forced[f]
    const b = forced[(f + 1) % forced.length]
    const span = ((b - a + n) % n || n) + 1 // inclusive vertex count of the chain
    const chain: number[] = []
    for (let s = 0; s < span; s++) {
      const [x, y] = at(a + s)
      chain.push(x, y)
    }
    const t1 = endTangent(pts, n, a, true, params)
    const t2 = endTangent(pts, n, b % n, false, params)
    const cubics = fitChain(chain, epsilon, params.maxIterations, t1, t2)
    for (let c = 0; c < cubics.length; c += 8) {
      d += `C${fmt(cubics[c + 2], precision)},${fmt(cubics[c + 3], precision)} ${fmt(cubics[c + 4], precision)},${fmt(cubics[c + 5], precision)} ${fmt(cubics[c + 6], precision)},${fmt(cubics[c + 7], precision)}`
    }
  }
  return `${d}Z`
}

/**
 * Forced split vertices of a closed loop: corners (≥ cornerThreshold) and soft anchors (≥
 * spliceThreshold). With none at all, split at vertex 0 and its farthest vertex so the fully-smooth
 * loop still closes with two fits.
 */
function forcedAnchors(pts: number[], params: TraceParams): number[] {
  const n = pts.length / 2
  const forced: number[] = []
  for (let i = 0; i < n; i++) {
    const px = pts[((i - 1 + n) % n) * 2]
    const py = pts[((i - 1 + n) % n) * 2 + 1]
    const cx = pts[i * 2]
    const cy = pts[i * 2 + 1]
    const nx = pts[((i + 1) % n) * 2]
    const ny = pts[((i + 1) % n) * 2 + 1]
    const turn = turnDeg([px, py], [cx, cy], [nx, ny])
    if (turn >= params.cornerThreshold || turn >= params.spliceThreshold) forced.push(i)
  }
  if (forced.length < 2) {
    let far = 1
    let farD = -1
    for (let i = 1; i < n; i++) {
      const dx = pts[i * 2] - pts[0]
      const dy = pts[i * 2 + 1] - pts[1]
      const d = dx * dx + dy * dy
      if (d > farD) {
        farD = d
        far = i
      }
    }
    const pair = forced.length === 1 ? [forced[0], far] : [0, far]
    pair.sort((x, y) => x - y)
    return pair
  }
  return forced
}

/**
 * Forced tangent where a chain meets vertex `i`: hard corners get the one-sided chord direction
 * (visible kink), soft anchors get the two-sided center direction (smooth pass-through). `forward`
 * selects the chain-entry (pointing into the chain) or chain-exit (pointing backward) convention
 * expected by fitChain.
 */
function endTangent(
  pts: number[],
  n: number,
  i: number,
  forward: boolean,
  params: TraceParams,
): Tangent {
  const cx = pts[i * 2]
  const cy = pts[i * 2 + 1]
  const prev = (i - 1 + n) % n
  const next = (i + 1) % n
  const px = pts[prev * 2]
  const py = pts[prev * 2 + 1]
  const nx = pts[next * 2]
  const ny = pts[next * 2 + 1]
  const turn = turnDeg([px, py], [cx, cy], [nx, ny])
  if (turn >= params.cornerThreshold) {
    return forward ? norm([nx - cx, ny - cy]) : norm([px - cx, py - cy])
  }
  return forward ? norm([nx - px, ny - py]) : norm([px - nx, py - ny])
}

function norm(t: [number, number]): Tangent {
  const len = Math.hypot(t[0], t[1])
  return len < 1e-12 ? [0, 0] : [t[0] / len, t[1] / len]
}

/** Wrap finished paths into a standalone SVG document. */
export function composeSvg(width: number, height: number, paths: SvgPath[], defs?: string): string {
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
  ]
  if (defs && defs.trim() !== '') parts.push(`<defs>${defs}</defs>`)
  for (const p of paths) {
    const attrs = [`d="${p.d}"`]
    if (p.stroke) {
      attrs.push('fill="none"', `stroke="${p.stroke}"`)
      attrs.push(`stroke-width="${p.strokeWidth ?? 1}"`, 'stroke-linecap="round"')
    } else {
      attrs.push(`fill="${p.fill ?? 'none'}"`, 'fill-rule="evenodd"')
    }
    parts.push(`<path ${attrs.join(' ')}/>`)
  }
  parts.push('</svg>')
  return parts.join('\n')
}
