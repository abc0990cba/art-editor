import { useEffect, useRef, useState } from 'react'

import type { ImportBitmap } from '../../engine/import-image.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { FitCanvasButton } from '../../shared/ui/fit-button.component.tsx'
import { Chip } from '../../shared/ui/index.tsx'
import { ZoomControls } from '../../shared/ui/zoom-controls.component.tsx'
import { usePanPinchGestures, type PanPinchView } from './use-pinch-pan.hook.ts'

/**
 * Zoom/pan preview of the vector workspace: shows the traced SVG or the original raster. Wheel and
 * the bottom-right zoom plate step the zoom, drag / one finger pans, two fingers pinch — same pair
 * of plates as the pixel canvas (fit bottom-left, zoom bottom-right). The SVG lands in an <img> via
 * a blob URL so browser scaling stays smooth and the markup can't leak styles into the app.
 */

const MIN_ZOOM = 0.05
const MAX_ZOOM = 64

const clampZoom = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))

export function VectorPreview({
  source,
  svg,
  showOriginal,
  controls = true,
}: {
  source: ImportBitmap
  svg: string | null
  showOriginal: boolean
  /** Zoom/fit plates; the compact preview inside the params sheet hides them */
  controls?: boolean
}) {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<PanPinchView>({ zoom: 1, x: 0, y: 0 })
  const gestures = usePanPinchGestures({
    containerRef,
    view,
    setView,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
  })
  // the blob URL is created inside the effect so every revoke is followed by a fresh create —
  // a memoized URL dies under StrictMode's simulated remount (the sheet preview mounts with svg)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!svg) {
      setObjectUrl(null)
      return
    }
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [svg])

  const fit = (): void => {
    const box = containerRef.current?.getBoundingClientRect()
    if (!box) return
    const zoom = Math.min((box.width - 32) / source.width, (box.height - 32) / source.height)
    setView({
      zoom,
      x: (box.width - source.width * zoom) / 2,
      y: (box.height - source.height * zoom) / 2,
    })
  }
  useEffect(() => {
    fit()
    // refit when the image dimensions or the viewport change (rotate, panel open/close)
    const observer = new ResizeObserver(() => fit())
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [source.width, source.height])

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
        {showOriginal || !objectUrl ? (
          <SourceCanvas source={source} />
        ) : (
          <img
            src={objectUrl}
            width={source.width}
            height={source.height}
            alt={t('vector.result')}
            draggable={false}
            className="block select-none"
          />
        )}
      </div>
      {controls && (
        <>
          <FitCanvasButton label={t('vector.fit')} onFit={fit} />
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

function SourceCanvas({ source }: { source: ImportBitmap }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    canvas.width = source.width
    canvas.height = source.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(source.data), source.width, source.height),
      0,
      0,
    )
  }, [source])
  return <canvas ref={ref} className="block select-none" style={{ imageRendering: 'pixelated' }} />
}

/** Original/result switch shown above the preview. */
export function ViewToggle({
  value,
  onChange,
}: {
  value: 'result' | 'original'
  onChange: (v: 'result' | 'original') => void
}) {
  const { t } = useI18n()
  return (
    <div className="flex gap-1">
      <Chip active={value === 'result'} onClick={() => onChange('result')}>
        {t('vector.result')}
      </Chip>
      <Chip active={value === 'original'} onClick={() => onChange('original')}>
        {t('vector.original')}
      </Chip>
    </div>
  )
}
