/** Corner-rounding and bulge decorations applied to finished shape polylines. */

import type { ShapeOpts } from './shape-tools.ts'
import type { Polyline } from './shape-util.ts'
import { clamp } from './shape-util.ts'

/** Axis-aligned rounded rectangle as a closed polyline (r in the same units as the box). */
export function roundedRectPolyline(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
): Polyline {
  const w = Math.abs(x1 - x0)
  const h = Math.abs(y1 - y0)
  const rr = Math.min(r, w / 2, h / 2)
  if (rr <= 1e-9) {
    return [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
      [x0, y0],
    ]
  }
  const pts: Polyline = []
  const corner = (cx: number, cy: number, a0: number, a1: number) => {
    const n = 5
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n
      pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)])
    }
  }
  corner(x1 - rr, y0 + rr, -Math.PI / 2, 0)
  corner(x1 - rr, y1 - rr, 0, Math.PI / 2)
  corner(x0 + rr, y1 - rr, Math.PI / 2, Math.PI)
  corner(x0 + rr, y0 + rr, Math.PI, (Math.PI * 3) / 2)
  pts.push(pts[0])
  return pts
}

/**
 * Round every vertex of a polyline by replacing it with a quadratic arc through the vertex (r in
 * the same units as the points). Closed loops repeat their first vertex, matching the shape-tool
 * convention.
 */
function roundedPolyline(pts: Polyline, r: number): Polyline {
  if (r <= 1e-9 || pts.length < 3) return pts
  const closed = pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]
  const vs = closed ? pts.slice(0, -1) : pts
  if (vs.length < 3) return pts
  const out: Polyline = []
  const m = vs.length
  for (let i = 0; i < m; i++) {
    const v = vs[i]
    if (!closed && (i === 0 || i === m - 1)) {
      out.push(v)
      continue
    }
    const p = vs[(i - 1 + m) % m]
    const q = vs[(i + 1) % m]
    const d1 = Math.hypot(v[0] - p[0], v[1] - p[1])
    const d2 = Math.hypot(q[0] - v[0], q[1] - v[1])
    if (d1 < 1e-9 || d2 < 1e-9) {
      out.push(v)
      continue
    }
    const d = Math.min(r, d1 / 2, d2 / 2)
    const a: [number, number] = [v[0] + ((p[0] - v[0]) * d) / d1, v[1] + ((p[1] - v[1]) * d) / d1]
    const b: [number, number] = [v[0] + ((q[0] - v[0]) * d) / d2, v[1] + ((q[1] - v[1]) * d) / d2]
    for (let s = 0; s <= 4; s++) {
      const t = s / 4
      const u = 1 - t
      out.push([
        u * u * a[0] + 2 * u * t * v[0] + t * t * b[0],
        u * u * a[1] + 2 * u * t * v[1] + t * t * b[1],
      ])
    }
  }
  if (closed) out.push(out[0])
  return out
}

/**
 * Bow every edge of a closed polyline away from the centroid (positive) or pinch it toward the
 * centroid (negative); amount is a fraction of the edge length.
 */
export function bulgePolyline(pts: Polyline, amount: number): Polyline {
  if (Math.abs(amount) < 1e-9 || pts.length < 3) return pts
  const closed = pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]
  const vs = closed ? pts.slice(0, -1) : pts
  const m = vs.length
  if (m < 3) return pts
  let cx = 0
  let cy = 0
  for (const v of vs) {
    cx += v[0]
    cy += v[1]
  }
  cx /= m
  cy /= m
  const out: Polyline = []
  const edgeCount = closed ? m : m - 1
  for (let i = 0; i < edgeCount; i++) {
    const a = vs[i]
    const b = vs[(i + 1) % m]
    out.push(a)
    const mx = (a[0] + b[0]) / 2
    const my = (a[1] + b[1]) / 2
    let nx = mx - cx
    let ny = my - cy
    const nl = Math.hypot(nx, ny)
    if (nl < 1e-9) continue
    nx /= nl
    ny /= nl
    const off = amount * Math.hypot(b[0] - a[0], b[1] - a[1])
    for (const t of [0.25, 0.5, 0.75]) {
      const k = 4 * t * (1 - t) // quadratic bump peaking at the displaced midpoint
      out.push([mx + nx * off * k, my + ny * off * k])
    }
  }
  if (closed) out.push(out[0])
  else out.push(vs[m - 1])
  return out
}

/** Apply the shared corner-rounding / bulge knobs to a finished shape's polylines. */
export function decoratePolylines(polys: Polyline[], opts: ShapeOpts): Polyline[] {
  const corner = clamp(opts.shapeCorner ?? 0, 0, 0.5)
  const bulge = clamp(opts.shapeBulge ?? 0, -1, 1)
  if (corner <= 1e-9 && Math.abs(bulge) <= 1e-9) return polys
  return polys.map((poly) => {
    let out = poly
    if (Math.abs(bulge) > 1e-9) out = bulgePolyline(out, bulge * 0.3)
    if (corner > 1e-9) out = roundedPolyline(out, corner)
    return out
  })
}
