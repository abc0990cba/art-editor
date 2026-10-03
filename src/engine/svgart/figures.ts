/**
 * Parametric contours → absolute SVG path data. All rotations are baked into coordinates so the
 * serializer never emits transforms for geometry (group transforms stay reserved for elliptical
 * radial falloffs, which cannot be baked into a circle gradient).
 */

import type { BBox, Pt, Shape } from './types.ts'

const KAPPA = 0.5522847498307936

const rad = (deg: number): number => (deg * Math.PI) / 180

/** Star polygon: `points` outer vertices of radius R alternating with inner vertices of radius r. */
export function starPoints(center: Pt, R: number, r: number, points: number, rotation = 0): Pt[] {
  const n = Math.max(2, Math.round(points))
  const out: Pt[] = []
  const a0 = rad(rotation) - Math.PI / 2
  for (let i = 0; i < n * 2; i++) {
    const angle = a0 + (i * Math.PI) / n
    const radius = i % 2 === 0 ? R : r
    out.push({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) })
  }
  return out
}

/** Small seeded PRNG (mulberry32) — deterministic blobs and aurora fields. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Closed smooth contour through `n` anchored points with seeded radius jitter. */
export function blobShape(center: Pt, R: number, seed: number, wobble = 0.3, n = 8): Shape {
  const rand = mulberry32(seed)
  const anchors: Pt[] = []
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2
    const radius = R * (1 + wobble * (rand() - 0.5))
    anchors.push({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) })
  }
  return { kind: 'path', d: smoothClosedPath(anchors), anchors }
}

/** Catmull-Rom → cubic Bézier conversion of a closed point loop (used by blobs). */
export function smoothClosedPath(pts: Pt[]): string {
  const n = pts.length
  if (n < 3) return polyPath(pts)
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const p3 = pts[(i + 2) % n]
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }
    d += `C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p2.x)} ${f(p2.y)}`
  }
  return `${d}Z`
}

/** Absolute path data for any shape; the only geometry entry point the serializer uses. */
export function shapePath(shape: Shape): string {
  switch (shape.kind) {
    case 'rect':
      return rectPath(shape.cx, shape.w, shape.h, shape.radius, shape.rotation)
    case 'ellipse':
      return ellipsePath(shape.cx, shape.rx, shape.ry, shape.rotation)
    case 'star':
      return polyPath(starPoints(shape.cx, shape.R, shape.r, shape.points, shape.rotation))
    case 'poly':
      return polyPath(shape.points)
    case 'path':
      return shape.d
  }
}

/** Conservative axis-aligned bounding box (rotated shapes use the enclosing box of their extents). */
export function shapeBBox(shape: Shape): BBox {
  switch (shape.kind) {
    case 'rect': {
      const hw = Math.abs(shape.w) / 2
      const hh = Math.abs(shape.h) / 2
      return rotatedExtents(shape.cx, hw, hh, shape.rotation)
    }
    case 'ellipse': {
      const phi = rad(shape.rotation)
      const cos = Math.abs(Math.cos(phi))
      const sin = Math.abs(Math.sin(phi))
      return rotatedExtents(
        shape.cx,
        shape.rx * cos + shape.ry * sin,
        shape.rx * sin + shape.ry * cos,
        0,
      )
    }
    case 'star':
    case 'poly': {
      const pts =
        shape.kind === 'star'
          ? starPoints(shape.cx, shape.R, shape.r, shape.points, shape.rotation)
          : shape.points
      return pointsBBox(pts)
    }
    case 'path':
      return pointsBBox(shape.anchors)
  }
}

export function pointsBBox(pts: Pt[]): BBox {
  if (pts.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function polyPath(pts: Pt[]): string {
  if (pts.length === 0) return ''
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`
  for (let i = 1; i < pts.length; i++) d += `L${f(pts[i].x)} ${f(pts[i].y)}`
  return `${d}Z`
}

function rectPath(cx: Pt, w: number, h: number, radius: number, rotation: number): string {
  const phi = rad(rotation)
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const map = (lx: number, ly: number): Pt => ({
    x: cx.x + lx * cos - ly * sin,
    y: cx.y + lx * sin + ly * cos,
  })
  const hw = Math.abs(w) / 2
  const hh = Math.abs(h) / 2
  const r = Math.max(0, Math.min(radius, Math.min(hw, hh)))
  const k = KAPPA * r
  const start = map(-hw + r, -hh)
  let d = `M${f(start.x)} ${f(start.y)}`
  const seg = (lx: number, ly: number): void => {
    const e = map(lx, ly)
    d += `L${f(e.x)} ${f(e.y)}`
  }
  const corner = (endL: [number, number], c1L: [number, number], c2L: [number, number]): void => {
    const c1 = map(c1L[0], c1L[1])
    const c2 = map(c2L[0], c2L[1])
    const e = map(endL[0], endL[1])
    d += `C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(e.x)} ${f(e.y)}`
  }
  seg(hw - r, -hh)
  corner([hw, -hh + r], [hw - r + k, -hh], [hw, -hh + r - k])
  seg(hw, hh - r)
  corner([hw - r, hh], [hw, hh - r + k], [hw - r + k, hh])
  seg(-hw + r, hh)
  corner([-hw, hh - r], [-hw + r - k, hh], [-hw, hh - r + k])
  seg(-hw, -hh + r)
  corner([-hw + r, -hh], [-hw, -hh + r - k], [-hw + r - k, -hh])
  return `${d}Z`
}

function ellipsePath(cx: Pt, rx: number, ry: number, rotation: number): string {
  const phi = rad(rotation)
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const pt = (t: number): Pt => {
    const x = rx * Math.cos(t)
    const y = ry * Math.sin(t)
    return { x: cx.x + x * cos - y * sin, y: cx.y + x * sin + y * cos }
  }
  // Tangent handle: arc point plus the rotated tangent offset P'(t) = (−rx·sin, ry·cos).
  const handle = (t: number, along: 1 | -1): Pt => {
    const x = rx * Math.cos(t) - rx * Math.sin(t) * KAPPA * along
    const y = ry * Math.sin(t) + ry * Math.cos(t) * KAPPA * along
    return { x: cx.x + x * cos - y * sin, y: cx.y + x * sin + y * cos }
  }
  let d = `M${f(pt(0).x)} ${f(pt(0).y)}`
  for (let q = 1; q <= 4; q++) {
    const t1 = ((q - 1) * Math.PI) / 2
    const t2 = (q * Math.PI) / 2
    const c1 = handle(t1, 1)
    const c2 = handle(t2, -1)
    const end = pt(t2)
    d += `C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(end.x)} ${f(end.y)}`
  }
  return `${d}Z`
}

function rotatedExtents(cx: Pt, hw: number, hh: number, rotation: number): BBox {
  const phi = rad(rotation)
  const cos = Math.abs(Math.cos(phi))
  const sin = Math.abs(Math.sin(phi))
  const ex = hw * cos + hh * sin
  const ey = hw * sin + hh * cos
  return { x: cx.x - ex, y: cx.y - ey, w: ex * 2, h: ey * 2 }
}

function f(v: number): string {
  return num(v)
}

/** Trimmed 3-decimal number formatting (no trailing zeros, no `-0`). */
export function num(v: number): string {
  let s = v.toFixed(3)
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '')
  return s === '-0' ? '0' : s
}
