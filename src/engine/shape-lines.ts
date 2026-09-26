/** Primitive point generators: Bresenham lines, rectangles, ellipses and cell rasterization. */

import { bulgePolyline, roundedRectPolyline } from './shape-decorate.ts'
import type { ShapeOpts } from './shape-tools.ts'
import type { Polyline } from './shape-util.ts'
import { clamp } from './shape-util.ts'

export function linePoints(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const pts: [number, number][] = []
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  let x = x0
  let y = y0
  for (let guard = 0; guard < 100_000; guard++) {
    pts.push([x, y])
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
  }
  return pts
}

export function rectPoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  opts: ShapeOpts = {},
): [number, number][] {
  const ax = Math.min(x0, x1)
  const bx = Math.max(x0, x1)
  const ay = Math.min(y0, y1)
  const by = Math.max(y0, y1)
  const corner = clamp(opts.shapeCorner ?? 0, 0, 0.5)
  const bulge = clamp(opts.shapeBulge ?? 0, -1, 1)
  // fast path keeps the pixel-exact rows/columns of the plain rectangle
  if (corner <= 1e-9 && Math.abs(bulge) <= 1e-9) {
    const pts = new Map<string, [number, number]>()
    for (let x = ax; x <= bx; x++) {
      pts.set(`${x},${ay}`, [x, ay])
      pts.set(`${x},${by}`, [x, by])
    }
    for (let y = ay; y <= by; y++) {
      pts.set(`${ax},${y}`, [ax, y])
      pts.set(`${bx},${y}`, [bx, y])
    }
    return [...pts.values()]
  }
  let poly = roundedRectPolyline(ax, ay, bx, by, corner * Math.min(bx - ax, by - ay))
  if (Math.abs(bulge) > 1e-9) poly = bulgePolyline(poly, bulge * 0.25)
  return polylineCells([poly])
}

export function ellipsePoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  opts: ShapeOpts = {},
): [number, number][] {
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const a = Math.abs(x1 - x0) / 2
  const b = Math.abs(y1 - y0) / 2
  if (a === 0 && b === 0) return [[x0, y0]]
  // superellipse exponent: 2 = ordinary ellipse, <2 pinched, >2 squircle
  const power = clamp(opts.ellipsePower ?? 2, 0.5, 8)
  const e = 2 / power
  const steps = Math.max(16, Math.ceil((a + b) * 4))
  const pts = new Map<string, [number, number]>()
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * 2 * Math.PI
    const ct = Math.cos(t)
    const st = Math.sin(t)
    const px = Math.round(cx + a * Math.sign(ct) * Math.abs(ct) ** e)
    const py = Math.round(cy + b * Math.sign(st) * Math.abs(st) ** e)
    pts.set(`${px},${py}`, [px, py])
  }
  return [...pts.values()]
}

/** Rasterize float polylines into integer cells, Bresenham-traced between vertices. */
export function polylineCells(segs: Polyline[]): [number, number][] {
  const pts = new Map<string, [number, number]>()
  for (const poly of segs) {
    let px = Math.round(poly[0][0])
    let py = Math.round(poly[0][1])
    pts.set(`${px},${py}`, [px, py])
    for (let i = 1; i < poly.length; i++) {
      const qx = Math.round(poly[i][0])
      const qy = Math.round(poly[i][1])
      if (qx !== px || qy !== py) {
        for (const [lx, ly] of linePoints(px, py, qx, qy)) pts.set(`${lx},${ly}`, [lx, ly])
        px = qx
        py = qy
      }
    }
  }
  return [...pts.values()]
}
