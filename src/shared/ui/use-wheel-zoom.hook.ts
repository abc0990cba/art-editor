import { useEffect, useRef, type RefObject } from 'react'

import {
  anchoredZoom,
  isHorizontalWheel,
  wheelDeltaPx,
  wheelZoomFactor,
  type CanvasView,
} from '../lib/canvas-view-math.util.ts'

/**
 * Wheel navigation for a zoomable viewport, one implementation for every canvas space: a native
 * non-passive listener (React's `onWheel` is passive — `preventDefault` would be a no-op and a
 * trackpad pinch would page-zoom the browser), plain wheel zooms around the cursor, ctrl+wheel (the
 * trackpad pinch) gets the stiffer pinch curve, Shift or a sideways scroll pans horizontally. The
 * view is read through `getView` and written back whole through `applyView`, so both single-state
 * viewports and split zoom/pan state work; keep both calls ref-stable (useCallback).
 */
export function useWheelZoom({
  target,
  getView,
  applyView,
  minZoom,
  maxZoom,
}: {
  /** The viewport element that claims wheel gestures */
  target: RefObject<HTMLElement | null>
  /** Live view accessor — a state mirror or a split zoom/pan state behind refs */
  getView: () => CanvasView
  /** Writes the whole next view */
  applyView: (v: CanvasView) => void
  minZoom: number
  maxZoom: number
}): void {
  // latest callbacks behind a ref: the listener subscribes once per element, not per render
  const cbs = useRef({ getView, applyView })
  cbs.current = { getView, applyView }

  useEffect(() => {
    const el = target.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const dx = wheelDeltaPx(e.deltaX, e.deltaMode)
      const dy = wheelDeltaPx(e.deltaY, e.deltaMode)
      if (isHorizontalWheel(dx, dy, e.shiftKey)) {
        // Chrome puts shift+wheel's value into deltaX, Firefox keeps deltaY — accept either
        const v = cbs.current.getView()
        cbs.current.applyView({ ...v, x: v.x - (dx === 0 ? dy : dx) })
        return
      }
      const r = el.getBoundingClientRect()
      const v = cbs.current.getView()
      cbs.current.applyView(
        anchoredZoom(
          v,
          v.zoom * wheelZoomFactor(dy, e.ctrlKey),
          e.clientX - r.left,
          e.clientY - r.top,
          { min: minZoom, max: maxZoom },
        ),
      )
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [maxZoom, minZoom, target])
}
