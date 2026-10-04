import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react'

import {
  anchoredZoom,
  isHorizontalWheel,
  wheelDeltaPx,
  wheelZoomFactor,
  ZOOM_STEP,
  type CanvasView,
} from './canvas-view-math.util.ts'

interface ViewDeps {
  wrapRef: RefObject<HTMLDivElement | null>
  /** Live mirror of the view state: one-shot listeners read the view at gesture start */
  viewRef: RefObject<CanvasView>
  setView: Dispatch<SetStateAction<CanvasView>>
  /** Live flag: Space is held — a drag pans instead of drawing */
  spaceRef: RefObject<boolean>
  onSpaceChange: (down: boolean) => void
  /** Cancels an in-flight stroke/transform/connector preview (pinch landing, Escape) */
  cancelGestureRef: RefObject<() => void>
  clearSelection: () => void
}

/**
 * Canvas navigation, extracted from the stage component: wheel zoom (Shift or a sideways scroll
 * pans instead), two-finger touch pinch+pan, and the view keys — Space (temporary pan), Escape
 * (cancel), +/−/0 (zoom in/out/reset). The zoom keys are deliberately plain: Cmd/Ctrl
 * plus/minus/zero stay with the browser, which owns the app-scale zoom.
 */
export function useCanvasView({
  wrapRef,
  viewRef,
  setView,
  spaceRef,
  onSpaceChange,
  cancelGestureRef,
  clearSelection,
}: ViewDeps): void {
  // ---- two-finger touch: pinch to zoom, move to pan (Procreate-style) ----
  // capture-phase listeners see both pointers before the drawing handlers; the
  // in-progress stroke is cancelled the moment the second finger lands
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const pts = new Map<number, { x: number; y: number }>()
    let start: null | {
      d0: number
      cx0: number
      cy0: number
      view: CanvasView
    } = null
    const down = (e: PointerEvent) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size === 2 && !start) {
        cancelGestureRef.current()
        const [a, b] = [...pts.values()]
        const r = el.getBoundingClientRect()
        start = {
          d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
          cx0: (a.x + b.x) / 2 - r.left,
          cy0: (a.y + b.y) / 2 - r.top,
          view: { ...viewRef.current },
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
      // computed eagerly from the gesture-start snapshot: the setState updater may
      // flush after the gesture ended and `start` was cleared
      setView(anchoredZoom(start.view, start.view.zoom * (d / start.d0), cx, cy))
    }
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId)
      if (pts.size < 2) start = null
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
  }, [cancelGestureRef, viewRef, setView, wrapRef])

  // ---- wheel: zoom around the cursor; Shift or a sideways scroll pans horizontally ----
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const dx = wheelDeltaPx(e.deltaX, e.deltaMode)
      const dy = wheelDeltaPx(e.deltaY, e.deltaMode)
      if (isHorizontalWheel(dx, dy, e.shiftKey)) {
        // Chrome puts shift+wheel's value into deltaX, Firefox keeps deltaY — accept either
        setView((v) => ({ ...v, x: v.x - (dx === 0 ? dy : dx) }))
        return
      }
      const r = el.getBoundingClientRect()
      setView((v) =>
        anchoredZoom(
          v,
          v.zoom * wheelZoomFactor(dy, e.ctrlKey),
          e.clientX - r.left,
          e.clientY - r.top,
        ),
      )
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [setView, wrapRef])

  // ---- keys: Space to pan, Escape to cancel, plain +/−/0 to zoom ----
  useEffect(() => {
    const onEditable = (e: KeyboardEvent) =>
      (e.target as HTMLElement | null)?.closest('input,textarea,select,[contenteditable]') != null
    const zoomCenter = () => {
      const r = wrapRef.current?.getBoundingClientRect()
      return r ? { cx: r.width / 2, cy: r.height / 2 } : null
    }
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !onEditable(e)) {
        spaceRef.current = true
        onSpaceChange(true)
        e.preventDefault()
      }
      if (e.key === 'Escape') {
        cancelGestureRef.current()
        clearSelection()
      }
      // plain keys only: Cmd/Ctrl plus/minus/zero belong to the browser's page zoom
      if (e.metaKey || e.ctrlKey || e.altKey || onEditable(e)) return
      const c = zoomCenter()
      if (!c) return
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        setView((v) => anchoredZoom(v, v.zoom * ZOOM_STEP, c.cx, c.cy))
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        setView((v) => anchoredZoom(v, v.zoom / ZOOM_STEP, c.cx, c.cy))
      } else if (e.key === '0') {
        e.preventDefault()
        setView((v) => anchoredZoom(v, 1, c.cx, c.cy))
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceRef.current = false
        onSpaceChange(false)
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [cancelGestureRef, clearSelection, onSpaceChange, spaceRef, setView, wrapRef])
}

interface ScrollbarDeps {
  setView: Dispatch<SetStateAction<CanvasView>>
  /** Live mirror of the view state: thumb drags start from the absolute offset */
  viewRef: RefObject<CanvasView>
}

/**
 * Overlay-scrollbar dragging, extracted from the stage: the thumb maps a pointer delta onto the
 * view offset (scale = px per doc unit), the track jumps the viewport to the click point.
 */
export function useScrollbarDrag({ setView, viewRef }: ScrollbarDeps): {
  thumbDown: (axis: 'x' | 'y', scale: number) => (e: React.PointerEvent<HTMLDivElement>) => void
  thumbMove: (e: React.PointerEvent<HTMLDivElement>) => void
  thumbUp: () => void
  trackDown: (
    axis: 'x' | 'y',
    scale: number,
    viewportDoc: number,
  ) => (e: React.PointerEvent<HTMLDivElement>) => void
} {
  const scrollDrag = useRef<{
    axis: 'x' | 'y'
    startPx: number
    startView: number
    scale: number
  } | null>(null)
  const thumbDown = (axis: 'x' | 'y', scale: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    scrollDrag.current = {
      axis,
      startPx: axis === 'x' ? e.clientX : e.clientY,
      startView: axis === 'x' ? viewRef.current.x : viewRef.current.y,
      scale,
    }
  }
  const thumbMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = scrollDrag.current
    if (!d) return
    const px = d.axis === 'x' ? e.clientX : e.clientY
    const delta = (px - d.startPx) / d.scale
    if (d.axis === 'x') setView((v) => ({ ...v, x: d.startView - delta * v.zoom }))
    else setView((v) => ({ ...v, y: d.startView - delta * v.zoom }))
  }
  const thumbUp = () => {
    scrollDrag.current = null
  }
  const trackDown =
    (axis: 'x' | 'y', scale: number, viewportDoc: number) =>
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const px = axis === 'x' ? e.clientX - rect.left : e.clientY - rect.top
      const newStart = px / scale - viewportDoc / 2
      if (axis === 'x') setView((v) => ({ ...v, x: -newStart * v.zoom }))
      else setView((v) => ({ ...v, y: -newStart * v.zoom }))
    }
  return { thumbDown, thumbMove, thumbUp, trackDown }
}
