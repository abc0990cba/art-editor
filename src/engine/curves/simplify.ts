/**
 * Anchor reduction: greedily delete the anchor whose removal deviates least from the original
 * flattened curve, until even the best candidate would bend it past `tol`. Collinear corner runs
 * collapse away; hand-drawn curves keep their character because error is measured against the
 * untouched original, not the previous iteration.
 */

import { flattenPath } from './flatten.ts'
import { clonePath, type CurvePath } from './model.ts'

export const SIMPLIFY_TOL = 0.6

/** Max deviation between two flattened polylines (second may have fewer points). */
function deviation(a: readonly Pt2[], b: readonly Pt2[]): number {
  let max = 0
  for (const [px, py] of a) {
    let best = Infinity
    for (let i = 1; i < b.length && best > 0; i++) {
      const d = segDist(px, py, b[i - 1], b[i])
      if (d < best) best = d
    }
    if (b.length === 1) best = Math.hypot(px - b[0][0], py - b[0][1])
    if (best > max) max = best
  }
  return max
}

function segDist(px: number, py: number, a: Pt2, b: Pt2): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l2))
  return Math.hypot(px - (a[0] + dx * t), py - (a[1] + dy * t))
}

type Pt2 = [number, number]

/**
 * Remove redundant anchors while keeping the flattened curve within `tol` cells of the original.
 * Endpoints of open paths are protected; a closed path may not shrink below 3 anchors.
 */
export function simplifyPath(path: CurvePath, tol = SIMPLIFY_TOL): CurvePath {
  const original = flattenPath(path)
  let out = clonePath(path)
  const protectedCount = out.closed ? 3 : 2
  for (;;) {
    const n = out.anchors.length
    if (n <= protectedCount) break
    let bestI = -1
    let bestD = Infinity
    for (let i = 0; i < n; i++) {
      if (!out.closed && (i === 0 || i === n - 1)) continue
      const trial = clonePath(out)
      trial.anchors.splice(i, 1)
      const d = deviation(original, flattenPath(trial))
      if (d < bestD) {
        bestD = d
        bestI = i
      }
    }
    if (bestI < 0 || bestD > tol) break
    out.anchors.splice(bestI, 1)
  }
  if (out.closed && out.anchors.length < 2) out.closed = false
  return out
}
