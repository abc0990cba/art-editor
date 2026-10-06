import { useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

/**
 * Pointer gestures for a zoomable viewport: one finger (or mouse) pans, two fingers pinch-zoom —
 * the content point under the initial midpoint stays under the moving midpoint, so the gesture
 * feels like grabbing the artwork. Wheel zoom stays with the component (it anchors at the cursor).
 * Presses that start on a button never pan and never take the container's pointer capture, so
 * overlay plates (zoom/fit) and the compare handle keep their own gestures — but the pointer is
 * still tracked, so a pinch starts even when one finger landed on a button.
 */

export interface PanPinchView {
  zoom: number
  x: number
  y: number
}

type Pt = { x: number; y: number; button: boolean }

/** Distance and midpoint of a two-finger gesture, in container-local coordinates. */
const pinchFrame = (a: Pt, b: Pt) => ({
  dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
  cx: (a.x + b.x) / 2,
  cy: (a.y + b.y) / 2,
})

export function usePanPinchGestures({
  containerRef,
  view,
  setView,
  minZoom,
  maxZoom,
}: {
  containerRef: RefObject<HTMLDivElement | null>
  view: PanPinchView
  setView: (updater: (v: PanPinchView) => PanPinchView) => void
  minZoom: number
  maxZoom: number
}) {
  const pointers = useRef(new Map<number, Pt>())
  const panRef = useRef<{ id: number; x: number; y: number; vx: number; vy: number } | null>(null)
  const pinchRef = useRef<{ dist: number; cx: number; cy: number; view: PanPinchView } | null>(null)

  const toLocal = (p: Pt): Pt => {
    const box = containerRef.current?.getBoundingClientRect()
    return box ? { ...p, x: p.x - box.left, y: p.y - box.top } : p
  }

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()].map(toLocal)
    pinchRef.current = { ...pinchFrame(a, b), view }
  }

  const applyPinch = () => {
    const p = pinchRef.current
    if (!p) return
    const [a, b] = [...pointers.current.values()].map(toLocal)
    const { dist, cx, cy } = pinchFrame(a, b)
    const zoom = Math.min(maxZoom, Math.max(minZoom, p.view.zoom * (dist / p.dist)))
    const s = zoom / p.view.zoom
    setView((v) => ({ zoom, x: cx - (p.cx - v.x) * s, y: cy - (p.cy - v.y) * s }))
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const onButton = !!(e.target as HTMLElement).closest('button')
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, button: onButton })
    if (pointers.current.size === 2) {
      panRef.current = null
      startPinch()
      return
    }
    if (onButton) return
    e.currentTarget.setPointerCapture(e.pointerId)
    if (pointers.current.size === 1) {
      panRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
    }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    pointers.current.set(e.pointerId, { ...prev, x: e.clientX, y: e.clientY })
    if (pinchRef.current) applyPinch()
    else if (panRef.current?.id === e.pointerId) {
      const p = panRef.current
      setView((v) => ({ ...v, x: p.vx + (e.clientX - p.x), y: p.vy + (e.clientY - p.y) }))
    }
  }

  const endPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    if (pinchRef.current && pointers.current.size < 2) {
      pinchRef.current = null
      // the surviving finger becomes the pan anchor so the gesture continues smoothly
      // (unless it started on a button — those never pan)
      const rest = [...pointers.current.entries()].find(([, p]) => !p.button)
      if (rest) panRef.current = { id: rest[0], x: rest[1].x, y: rest[1].y, vx: view.x, vy: view.y }
    }
    if (pointers.current.size === 0) panRef.current = null
  }

  return {
    handlePointerDown: onPointerDown,
    handlePointerMove: onPointerMove,
    handlePointerUp: endPointer,
    handlePointerCancel: endPointer,
  }
}
