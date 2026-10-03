/**
 * Illustrator-style transform box of the selection: handle layout in doc space, pointer→transform
 * math for the scale/rotate drags, overlay drawing and cursors. Pure geometry + canvas painting;
 * the drag state machine lives in use-selection-transform.hook.ts, cell remapping in
 * engine/selection-xform.ts.
 */

import type { StageTheme } from '../../engine/core/doc.ts'
import type { CellBox, SelectionXform } from '../../engine/effects/selection-xform.ts'
import type { DocPoint } from './canvas-stage.util.ts'

/** The eight handles of the box, named by position. */
export type XformHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

/** A box corner/edge position in doc units. */
export interface DocBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Doc-space box of a buffer-space CellBox (divide by sub-detail). */
export function docBoxOf(box: CellBox, sub: number): DocBox {
  return { x0: box.x0 / sub, y0: box.y0 / sub, x1: box.x1 / sub, y1: box.y1 / sub }
}

/** Handle anchor points in doc units, keyed by name. */
export function handlePoints(box: DocBox): Record<XformHandle, DocPoint> {
  const cx = (box.x0 + box.x1) / 2
  const cy = (box.y0 + box.y1) / 2
  return {
    nw: { x: box.x0, y: box.y0 },
    n: { x: cx, y: box.y0 },
    ne: { x: box.x1, y: box.y0 },
    e: { x: box.x1, y: cy },
    se: { x: box.x1, y: box.y1 },
    s: { x: cx, y: box.y1 },
    sw: { x: box.x0, y: box.y1 },
    w: { x: box.x0, y: cy },
  }
}

const HANDLES: XformHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** Handle hit radius in screen px; corners get a second, wider ring that rotates instead. */
export const HANDLE_HIT_PX = 7
export const ROTATE_HIT_PX = 16

/**
 * Which handle sits under the pointer ('rotate' = the zone just outside a corner, Illustrator's
 * free-rotate affordance). Touch pointers get a wider radius — no hover to aim with.
 */
export function hitHandle(
  box: DocBox | null,
  p: DocPoint,
  zoom: number,
  touch: boolean,
): { kind: 'handle'; handle: XformHandle } | { kind: 'rotate'; handle: XformHandle } | null {
  if (!box) return null
  const pts = handlePoints(box)
  const rHandle = (touch ? 12 : HANDLE_HIT_PX) / zoom
  const rRotate = (touch ? 20 : ROTATE_HIT_PX) / zoom
  const corners: XformHandle[] = ['nw', 'ne', 'se', 'sw']
  let best: { handle: XformHandle; d: number } | null = null
  for (const h of HANDLES) {
    const d = Math.hypot(p.x - pts[h].x, p.y - pts[h].y)
    if (d > rRotate) continue
    if (!best || d < best.d) best = { handle: h, d }
  }
  if (!best) return null
  if (best.d <= rHandle) return { kind: 'handle', handle: best.handle }
  return corners.includes(best.handle) ? { kind: 'rotate', handle: best.handle } : null
}

/** Curved two-arrow cursor of the rotate zones (data-URI SVG, hotspot at center). */
export const ROTATE_CURSOR = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'><path d='M15.5 6.5A6.5 6.5 0 1 0 16.9 11' fill='none' stroke='white' stroke-width='2.6'/><path d='M15.5 6.5A6.5 6.5 0 1 0 16.9 11' fill='none' stroke='black' stroke-width='1.2'/><path d='M13.2 4.4l3.2 1.5-1.1 3.4z' fill='white' stroke='black' stroke-width='0.8'/></svg>") 10 10, default`

/** Cursor for a hovered handle / rotate zone; null when the pointer is over plain canvas. */
export function cursorForHandle(hit: ReturnType<typeof hitHandle>): string | null {
  if (!hit) return null
  if (hit.kind === 'rotate') return ROTATE_CURSOR
  const map: Record<XformHandle, string> = {
    nw: 'nwse-resize',
    se: 'nwse-resize',
    ne: 'nesw-resize',
    sw: 'nesw-resize',
    n: 'ns-resize',
    s: 'ns-resize',
    e: 'ew-resize',
    w: 'ew-resize',
  }
  return map[hit.handle]
}

/** What a drag computes on every move: a scale around the fixed anchor or an angle about the center. */
export interface LiveXform {
  kind: 'scale'
  box: DocBox
  x: SelectionXform
}

export interface LiveRotate {
  kind: 'rotate'
  /** Center in doc units, start angle and the current snapped angle */
  cx: number
  cy: number
  angle0: number
  angle: number
}

/** Per-axis scale factors of a handle drag (1 = this axis does not scale). */
function axisScale(handle: XformHandle, box: DocBox, p: DocPoint): { sx: number; sy: number } {
  const w = box.x1 - box.x0
  const h = box.y1 - box.y0
  const isCorner = handle.length === 2
  let sx = 1
  let sy = 1
  if (isCorner || handle === 'e' || handle === 'w') {
    const anchorX = handle.includes('w') ? box.x1 : box.x0
    sx = handle.includes('w') ? (anchorX - p.x) / w : (p.x - anchorX) / w
  }
  if (isCorner || handle === 'n' || handle === 's') {
    const anchorY = handle.includes('n') ? box.y1 : box.y0
    sy = handle.includes('n') ? (anchorY - p.y) / h : (p.y - anchorY) / h
  }
  return { sx, sy }
}

/** Scale drag: pointer pulls one handle, the opposite corner/edge stays anchored. */
export function scaleDrag(
  box: DocBox,
  handle: XformHandle,
  p: DocPoint,
  proportional: boolean,
): LiveXform | null {
  const w = box.x1 - box.x0
  const h = box.y1 - box.y0
  if (w <= 0 || h <= 0) return null
  const isCorner = handle.length === 2
  let { sx, sy } = axisScale(handle, box, p)
  if (isCorner && proportional) {
    // corners scale uniformly; Shift frees the axes (Illustrator inverted for pixel work)
    const sign = (v: number) => (v < 0 ? -1 : 1)
    const s = Math.max(Math.abs(sx), Math.abs(sy))
    sx = sign(sx || 1) * s
    sy = sign(sy || 1) * s
  }
  // never collapse into a zero-area box (drag-flips are out of scope)
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null
  sx = Math.max(sx, 1 / w)
  sy = Math.max(sy, 1 / h)
  const x0 = handle.includes('w') ? box.x1 - w * sx : box.x0
  const y0 = handle.includes('n') ? box.y1 - h * sy : box.y0
  return {
    kind: 'scale',
    box: { x0, y0, x1: x0 + w * sx, y1: y0 + h * sy },
    x: {
      kind: 'scale',
      sx,
      sy,
      ax: handle.includes('w') ? box.x1 : box.x0,
      ay: handle.includes('n') ? box.y1 : box.y0,
    },
  }
}

/** Rotate drag: angle from the box center to the pointer, Shift snaps to 45° steps. */
export function rotateDrag(box: DocBox, angle0: number, p: DocPoint, snap: boolean): LiveRotate {
  const cx = (box.x0 + box.x1) / 2
  const cy = (box.y0 + box.y1) / 2
  let angle = Math.atan2(p.y - cy, p.x - cx) - angle0
  if (snap) {
    const step = Math.PI / 4
    angle = Math.round(angle / step) * step
  }
  return { kind: 'rotate', cx, cy, angle0, angle }
}

/** Transformed corners of the box under a rotate (for the overlay polygon). */
export function rotatedCorners(box: DocBox, angle: number): DocPoint[] {
  const cx = (box.x0 + box.x1) / 2
  const cy = (box.y0 + box.y1) / 2
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const rot = (x: number, y: number): DocPoint => {
    const dx = x - cx
    const dy = y - cy
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
  }
  return [rot(box.x0, box.y0), rot(box.x1, box.y0), rot(box.x1, box.y1), rot(box.x0, box.y1)]
}

/** Screen-constant handle size in px. */
const HANDLE_PX = 8

/**
 * The transform box: hairline rect (or rotated polygon), center cross while rotating and eight
 * square handles drawn screen-constant. Ants stay visible under it — the box reads as chrome.
 */
export function drawTransformBox(
  ctx: CanvasRenderingContext2D,
  live: LiveXform | LiveRotate | null,
  box: DocBox,
  theme: StageTheme,
  zoom: number,
): void {
  ctx.save()
  ctx.lineWidth = 1 / zoom
  if (live?.kind === 'rotate') {
    const corners = rotatedCorners(box, live.angle)
    ctx.strokeStyle = theme.guide
    ctx.beginPath()
    corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)))
    ctx.closePath()
    ctx.stroke()
    // center marker + radius line to the dragged direction
    const cx = live.cx
    const cy = live.cy
    ctx.beginPath()
    ctx.moveTo(cx - 4 / zoom, cy)
    ctx.lineTo(cx + 4 / zoom, cy)
    ctx.moveTo(cx, cy - 4 / zoom)
    ctx.lineTo(cx, cy + 4 / zoom)
    ctx.stroke()
    const a = live.angle0 + live.angle
    const r = Math.hypot(box.x1 - box.x0, box.y1 - box.y0) / 2
    ctx.setLineDash([3 / zoom, 3 / zoom])
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
    ctx.stroke()
    ctx.setLineDash([])
  } else {
    const b = live?.kind === 'scale' ? live.box : box
    ctx.strokeStyle = theme.guide
    ctx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0)
  }
  // handles ride the live box / rotated corners
  const pts =
    live?.kind === 'rotate'
      ? cornersToHandles(rotatedCorners(box, live.angle))
      : handlePoints(live?.kind === 'scale' ? live.box : box)
  const side = HANDLE_PX / zoom
  for (const h of HANDLES) {
    const pt = pts[h]
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.fillRect(pt.x - side / 2, pt.y - side / 2, side, side)
    ctx.strokeStyle = 'rgba(0,0,0,0.65)'
    ctx.lineWidth = 1 / zoom
    ctx.strokeRect(pt.x - side / 2, pt.y - side / 2, side, side)
  }
  ctx.restore()
}

/** Handle points of a box given by its four corners (rotation case). */
function cornersToHandles(c: DocPoint[]): Record<XformHandle, DocPoint> {
  const mid = (a: DocPoint, b: DocPoint): DocPoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  return {
    nw: c[0],
    n: mid(c[0], c[1]),
    ne: c[1],
    e: mid(c[1], c[2]),
    se: c[2],
    s: mid(c[2], c[3]),
    sw: c[3],
    w: mid(c[3], c[0]),
  }
}
