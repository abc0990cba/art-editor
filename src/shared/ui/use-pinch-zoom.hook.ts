import { useEffect, useRef, type RefObject } from 'react'

import { anchoredZoom, type CanvasView } from '../lib/canvas-view-math.util.ts'

/**
 * Two-finger pinch zoom+pan for a zoomable viewport, capture phase: the listeners see both pointers
 * before the surface's own handlers, so the gesture works over any child. The content point under
 * the starting midpoint stays under the moving one, so pinching also pans; the target zoom is
 * computed eagerly from the gesture-start snapshot (the setState updater may flush after the
 * gesture ended). `onGestureStart` fires when the second finger lands — cancel an in-progress drag
 * there; `ignoreButtons` keeps presses on buttons (plates, handles) out of the gesture. The view
 * uses the host-absolute doc-origin convention of `CanvasView`; keep `getView`/`applyView`
 * ref-stable (useCallback) — they are captured once.
 */
export function usePinchZoom({
  target,
  getView,
  applyView,
  minZoom,
  maxZoom,
  onGestureStart,
  onGestureEnd,
  ignoreButtons = false,
}: {
  /** The viewport element that claims touch gestures */
  target: RefObject<HTMLElement | null>
  /** Live view accessor — a state mirror or a split zoom/pan state behind refs */
  getView: () => CanvasView
  /** Writes the whole next view */
  applyView: (v: CanvasView) => void
  minZoom: number
  maxZoom: number
  /** The second finger landed: kill any in-flight surface drag */
  onGestureStart?: () => void
  /** Fewer than two fingers again */
  onGestureEnd?: () => void
  /** Don't let presses starting on a `button` join the gesture */
  ignoreButtons?: boolean
}): void {
  const cbs = useRef({ getView, applyView, onGestureStart, onGestureEnd })
  cbs.current = { getView, applyView, onGestureStart, onGestureEnd }

  useEffect(() => {
    const el = target.current
    if (!el) return
    const pts = new Map<number, { x: number; y: number }>()
    let start: null | { d0: number; cx0: number; cy0: number; view: CanvasView } = null
    const down = (e: PointerEvent) => {
      if (ignoreButtons && (e.target as HTMLElement).closest('button')) return
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size === 2 && !start) {
        cbs.current.onGestureStart?.()
        const [a, b] = [...pts.values()]
        const r = el.getBoundingClientRect()
        start = {
          d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
          cx0: (a.x + b.x) / 2 - r.left,
          cy0: (a.y + b.y) / 2 - r.top,
          view: cbs.current.getView(),
        }
      }
    }
    const move = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (!start || pts.size < 2) return
      e.stopPropagation()
      e.preventDefault()
      const [a, b] = [...pts.values()]
      const d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))
      const r = el.getBoundingClientRect()
      const cx = (a.x + b.x) / 2 - r.left
      const cy = (a.y + b.y) / 2 - r.top
      cbs.current.applyView(
        anchoredZoom(start.view, start.view.zoom * (d / start.d0), cx, cy, {
          min: minZoom,
          max: maxZoom,
        }),
      )
    }
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId)
      if (pts.size < 2) {
        start = null
        cbs.current.onGestureEnd?.()
      }
    }
    el.addEventListener('pointerdown', down, true)
    el.addEventListener('pointermove', move, true)
    el.addEventListener('pointerup', up, true)
    el.addEventListener('pointercancel', up, true)
    return () => {
      el.removeEventListener('pointerdown', down, true)
      el.removeEventListener('pointermove', move, true)
      el.removeEventListener('pointerup', up, true)
      el.removeEventListener('pointercancel', up, true)
    }
  }, [ignoreButtons, maxZoom, minZoom, target])
}
