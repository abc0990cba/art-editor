/**
 * Pure metrics for one axis of an overlay scrollbar: the track maps the canvas extent linearly, the
 * thumb mirrors the visible doc-space window. Pointer deltas convert to doc units through `scale`
 * (px per doc unit).
 */
export interface ScrollbarMetrics {
  /** The axis scrolls: the canvas is larger than the viewport on it */
  visible: boolean
  /** Px per doc unit along the track */
  scale: number
  /** Thumb length in px */
  thumbLen: number
  /** Thumb offset from the track start in px, clamped to the track */
  thumbPos: number
}

export function scrollbarMetrics(
  contentDoc: number,
  viewStartDoc: number,
  viewportDoc: number,
  trackLenPx: number,
  minThumbPx = 28,
): ScrollbarMetrics {
  const visible = viewportDoc < contentDoc - 1e-6 && trackLenPx > 0
  const scale = trackLenPx / contentDoc
  const thumbLen = Math.max(minThumbPx, Math.min(trackLenPx, viewportDoc * scale))
  const thumbPos = Math.max(0, Math.min(trackLenPx - thumbLen, viewStartDoc * scale))
  return { visible, scale, thumbLen, thumbPos }
}
