/** Pure view math of the canvas stage: wheel normalization, anchored zoom, clamps, offscreen test. */

export interface CanvasView {
  zoom: number
  x: number
  y: number
}

export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 80
/** Factor of the +/− keys (and hold-to-repeat zoom-plate buttons) */
export const ZOOM_STEP = 1.25
/** Exponential sensitivity of a plain wheel notch, per CSS px of delta */
const WHEEL_RATE = 0.0015
/** Trackpad pinch rides in as ctrl+wheel with tiny deltas — it needs a much stiffer curve */
const PINCH_RATE = 0.012

/** WheelEvent delta in CSS px regardless of deltaMode (1 = lines, 2 = pages). */
export function wheelDeltaPx(delta: number, mode: number): number {
  if (mode === 1) return delta * 16
  if (mode === 2) return delta * 100
  return delta
}

/** Multiplicative zoom factor for one wheel gesture. */
export function wheelZoomFactor(deltaPx: number, pinch: boolean): number {
  return Math.exp(-deltaPx * (pinch ? PINCH_RATE : WHEEL_RATE))
}

/**
 * Zoom to `targetZoom` keeping the doc point under the anchor (ax, ay) fixed, clamped to [ZOOM_MIN,
 * ZOOM_MAX].
 */
export function anchoredZoom(
  view: CanvasView,
  targetZoom: number,
  ax: number,
  ay: number,
): CanvasView {
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, targetZoom))
  const s = zoom / view.zoom
  return { zoom, x: ax - (ax - view.x) * s, y: ay - (ay - view.y) * s }
}

/** True when the wheel gesture is horizontal-dominant (Shift+wheel, sideways trackpad scroll). */
export function isHorizontalWheel(dxPx: number, dyPx: number, shift: boolean): boolean {
  return shift || Math.abs(dxPx) > Math.abs(dyPx)
}

/** True when no part of the doc extent (0..w × 0..h doc units) intersects the viewport. */
export function viewOffscreen(
  view: CanvasView,
  w: number,
  h: number,
  vw: number,
  vh: number,
): boolean {
  return view.x >= vw || view.y >= vh || view.x + w * view.zoom <= 0 || view.y + h * view.zoom <= 0
}
