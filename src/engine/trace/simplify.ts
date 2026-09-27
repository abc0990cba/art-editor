/**
 * Contour simplification: collinear-run merging plus a closed-loop Ramer–Douglas–Peucker. The loop
 * version anchors the recursion on a farthest-point pair instead of vertex 0, so diagonal
 * "staircases" simplify identically regardless of where the tracer started the loop.
 *
 * Geometry is flat number arrays of x,y pairs.
 */

/** Drop duplicate and exactly-collinear vertices of a closed loop. */
export function normalizeLoop(pts: number[]): number[] {
  const n = pts.length / 2
  if (n < 3) return pts.slice()
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const ax = pts[i * 2]
    const ay = pts[i * 2 + 1]
    const bx = pts[((i + 1) % n) * 2]
    const by = pts[((i + 1) % n) * 2 + 1]
    const cx = pts[((i + 2) % n) * 2]
    const cy = pts[((i + 2) % n) * 2 + 1]
    const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx)
    const dot = (bx - ax) * (cx - bx) + (by - ay) * (cy - by)
    if (cross === 0 && dot >= 0) continue // b lies on the a→c straight run
    out.push(bx, by)
  }
  return out.length >= 6 ? out : pts.slice()
}

interface RdpCtx {
  tolSq: number
  keep: Uint8Array
  stack: [number, number][]
}

/** Squared distance from flat-pair vertex i to the segment through flat-pair vertices a..b. */
function segDistSq(pts: number[], i: number, a: number, b: number): number {
  const px = pts[i * 2]
  const py = pts[i * 2 + 1]
  const ax = pts[a * 2]
  const ay = pts[a * 2 + 1]
  const bx = pts[b * 2]
  const by = pts[b * 2 + 1]
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  const t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq
  const cx = ax + Math.max(0, Math.min(1, t)) * dx
  const cy = ay + Math.max(0, Math.min(1, t)) * dy
  return (px - cx) * (px - cx) + (py - cy) * (py - cy)
}

/** Standard open-chain RDP; first and last points always survive. */
export function simplifyOpen(pts: number[], tol: number): number[] {
  const n = pts.length / 2
  if (n < 3 || tol <= 0) return pts
  const keep = new Uint8Array(n)
  keep[0] = 1
  keep[n - 1] = 1
  rdpRange(pts, 0, n - 1, { tolSq: tol * tol, keep, stack: [] })
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1])
  }
  return out
}

/**
 * Closed-loop RDP with epsilon `tol`. Anchors: vertex 0 and its farthest vertex, then the two arcs
 * between them simplify independently — the result does not depend on the loop's start vertex
 * beyond the anchor pick.
 */
export function simplifyLoop(pts: number[], tol: number): number[] {
  const n = pts.length / 2
  if (n < 4 || tol <= 0) return pts
  // anchor B = farthest vertex from anchor A = 0
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
  const keep = new Uint8Array(n)
  keep[0] = 1
  keep[far] = 1
  const ctx: RdpCtx = { tolSq: tol * tol, keep, stack: [] }
  rdpRange(pts, 0, far, ctx)
  rdpRange(pts, far, n, ctx) // arc far→n-1 plus closure to 0
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1])
  }
  // anchors are always kept, so a redundant anchor on a straight run can survive: one final
  // collinear pass makes the result independent of where the loop started
  return normalizeLoop(out.length >= 6 ? out : pts)
}

/** Mark surviving vertices of the open arc [i..j] (flat-pair indexes; j may equal n for wrap). */
function rdpRange(pts: number[], i: number, j: number, ctx: RdpCtx): void {
  ctx.stack.push([i, j])
  while (ctx.stack.length > 0) {
    const [a, b] = ctx.stack.pop()!
    if (b - a < 2) continue
    let maxD = -1
    let maxI = -1
    for (let k = a + 1; k < b; k++) {
      const d = segDistSq(pts, k, a, b === pts.length / 2 ? 0 : b)
      if (d > maxD) {
        maxD = d
        maxI = k
      }
    }
    if (maxD <= ctx.tolSq || maxI < 0) continue
    ctx.keep[maxI] = 1
    ctx.stack.push([a, maxI], [maxI, b])
  }
}
