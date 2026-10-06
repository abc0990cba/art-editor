import { useCallback, useRef, useState, type ReactNode } from 'react'

import { useI18n } from '../i18n/i18n.provider.tsx'

/**
 * Before/after comparison for the raster-anchored workspaces: a draggable divider sweeps across the
 * picture — left of it only the `left` layer shows, right of it only the `right` one (its
 * transparent areas reveal the parent viewport's checkerboard). Only the round handle (and arrow
 * keys) move the split, so the surrounding viewport keeps its pan gesture; the box lives in
 * document pixels and follows the parent's zoom/pan transform.
 */
export function CompareSplit({
  width,
  height,
  zoom,
  left,
  right,
}: {
  width: number
  height: number
  /** Current viewport zoom — the divider and handle counter-scale to keep their screen size */
  zoom: number
  left: ReactNode
  right: ReactNode
}) {
  const { t } = useI18n()
  const boxRef = useRef<HTMLDivElement>(null)
  const [split, setSplit] = useState(50)
  const dragging = useRef(false)

  const updateFromClientX = useCallback((clientX: number) => {
    const box = boxRef.current
    if (!box) return
    // the box lives inside the zoom/pan transform — its bounding rect already reflects it
    const r = box.getBoundingClientRect()
    const pct = ((clientX - r.left) / r.width) * 100
    setSplit(Math.max(0, Math.min(100, pct)))
  }, [])

  return (
    <div ref={boxRef} className="relative isolate select-none" style={{ width, height }}>
      {/* left layer, clipped to the left of the divider */}
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
        {left}
      </div>
      {/* right layer, clipped to the right of the divider */}
      <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
        {right}
      </div>

      {/* divider + handle, counter-scaled so they keep their screen size under zoom */}
      <div
        className="pointer-events-none absolute inset-y-0 bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
        style={{ left: `${split}%`, width: `${1.25 / zoom}px` }}
        aria-hidden
      />
      <button
        type="button"
        role="slider"
        aria-label={t('import.split.desc')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(split)}
        onPointerDown={(e) => {
          // no stopPropagation: the viewport's pinch hook must see this pointer so a pinch can
          // start with one finger on the handle (the handle keeps its own capture and drag)
          e.currentTarget.setPointerCapture(e.pointerId)
          dragging.current = true
          updateFromClientX(e.clientX)
        }}
        onPointerMove={(e) => {
          if (dragging.current) updateFromClientX(e.clientX)
        }}
        onPointerUp={() => {
          dragging.current = false
        }}
        onPointerCancel={() => {
          dragging.current = false
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 2
          if (e.key === 'ArrowLeft') setSplit((v) => Math.max(0, v - step))
          else if (e.key === 'ArrowRight') setSplit((v) => Math.min(100, v + step))
          else return
          e.preventDefault()
        }}
        className="border-line bg-raised text-body absolute top-1/2 z-10 flex h-11 w-11 cursor-ew-resize items-center justify-center rounded-full border shadow-md"
        style={{
          left: `${split}%`,
          transform: `translate(-50%, -50%) scale(${1 / zoom})`,
        }}
      >
        <svg
          viewBox="0 0 16 16"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 5L3.5 8 6 11M10 5l2.5 3L10 11M3.5 8h9" />
        </svg>
      </button>
    </div>
  )
}
