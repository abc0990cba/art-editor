import { useEffect, useRef, useState, type ReactNode } from 'react'

import { FitCanvasButton } from './fit-button.component.tsx'
import { usePanPinchGestures, type PanPinchView } from './use-pinch-pan.hook.ts'
import { ZoomControls } from './zoom-controls.component.tsx'

/**
 * Zoom/pan viewport for raster-anchored previews (vector and gradient workspaces): checkerboard
 * under the artwork, wheel + plate zoom anchored at the cursor, drag / one finger pans, two fingers
 * pinch — the same pair of plates as the pixel canvas (fit bottom-left, zoom bottom-right). The
 * children sit in the transformed document-pixel box; `overlay` renders untransformed above them
 * (viewport-pinned badges and the like).
 */

const MIN_ZOOM = 0.05
const MAX_ZOOM = 64

const clampZoom = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))

export function PanZoomPreview({
  width,
  height,
  children,
  overlay,
  controls = true,
  fitLabel,
  onZoomChange,
}: {
  /** Document-space box the children live in (drives fit) */
  width: number
  height: number
  children: ReactNode
  /** Untransformed viewport-pinned layer (corner badges) */
  overlay?: ReactNode
  /** Zoom/fit plates; the compact preview inside a params sheet hides them */
  controls?: boolean
  /** Accessible label of the fit plate */
  fitLabel: string
  /** Zoom changes, for doc-space overlays that must keep their screen size */
  onZoomChange?: (zoom: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<PanPinchView>({ zoom: 1, x: 0, y: 0 })
  useEffect(() => {
    onZoomChange?.(view.zoom)
  }, [view.zoom, onZoomChange])
  const gestures = usePanPinchGestures({
    containerRef,
    view,
    setView,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
  })

  const fit = (): void => {
    const box = containerRef.current?.getBoundingClientRect()
    if (!box || width === 0 || height === 0) return
    const zoom = Math.min((box.width - 32) / width, (box.height - 32) / height)
    setView({
      zoom,
      x: (box.width - width * zoom) / 2,
      y: (box.height - height * zoom) / 2,
    })
  }
  // refit when the image dimensions or the viewport change (rotate, panel open/close)
  useEffect(() => {
    fit()
    const observer = new ResizeObserver(() => fit())
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height])

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-0 flex-1 touch-none overflow-hidden"
      onWheel={(e) => {
        e.preventDefault()
        const box = containerRef.current?.getBoundingClientRect()
        if (!box) return
        const factor = Math.exp(-e.deltaY * 0.0015)
        setView((v) => {
          const zoom = clampZoom(v.zoom * factor)
          const px = e.clientX - box.left
          const py = e.clientY - box.top
          return {
            zoom,
            x: px - ((px - v.x) * zoom) / v.zoom,
            y: py - ((py - v.y) * zoom) / v.zoom,
          }
        })
      }}
      {...gestures}
    >
      {/* checkerboard under the artwork (alpha visibility) — same recipe as the import dialog */}
      <div
        className="absolute inset-0"
        aria-hidden
        style={{
          background:
            'conic-gradient(rgba(128,128,128,0.25) 25%, rgba(128,128,128,0.08) 0 50%, rgba(128,128,128,0.25) 0 75%, rgba(128,128,128,0.08) 0)',
          backgroundSize: '16px 16px',
        }}
      />
      <div
        className="absolute origin-top-left"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
      >
        {children}
      </div>
      {overlay}
      {controls && (
        <>
          <FitCanvasButton label={fitLabel} onFit={fit} />
          <ZoomControls
            zoom={view.zoom}
            setView={setView}
            wrap={containerRef.current}
            min={MIN_ZOOM}
            max={MAX_ZOOM}
          />
        </>
      )}
    </div>
  )
}
