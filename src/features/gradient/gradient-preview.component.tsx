import { useEffect, useRef, useState, type ReactElement } from 'react'

import type { ErrorMap } from '../../engine/gradient/pipeline.ts'
import type { ImportBitmap } from '../../engine/import/index.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { CompareSplit } from '../../shared/ui/compare-split.component.tsx'
import { PanZoomPreview } from '../../shared/ui/pan-zoom-preview.component.tsx'

/**
 * Gradient-workspace preview: the original raster and the fitted SVG (blob URL, so browser scaling
 * stays smooth and the markup can't leak styles into the app) stacked in one place with a draggable
 * divider, or the ΔE heatmap from the worker (dark red = close, yellow/white = where the vector
 * diverges). A storage restore has no heatmap until the next fit — the error toggle is disabled
 * then.
 */
export function GradientPreview({
  source,
  svg,
  demap,
  error,
  controls = true,
  busy = false,
}: {
  source: ImportBitmap
  svg: string | null
  demap: ErrorMap | null
  /** Show the ΔE heatmap instead of the original/result comparison */
  error: boolean
  /** Zoom/fit plates; the compact preview inside the params sheet hides them */
  controls?: boolean
  /** A fit is running: the shown result is stale and about to be replaced */
  busy?: boolean
}): ReactElement {
  const { t } = useI18n()
  const [zoom, setZoom] = useState(1)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const showHeatmap = error && demap !== null

  // the blob URL is created inside the effect so every revoke is followed by a fresh create
  useEffect(() => {
    if (!svg) {
      setObjectUrl(null)
      return
    }
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [svg])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !demap) return
    canvas.width = demap.width
    canvas.height = demap.height
    const img = ctx.createImageData(demap.width, demap.height)
    for (let i = 0; i < demap.data.length; i++) {
      const v = demap.data[i]
      img.data[i * 4] = Math.min(255, v * 2)
      img.data[i * 4 + 1] = v < 96 ? 0 : Math.min(255, (v - 96) * 2)
      img.data[i * 4 + 2] = v < 192 ? 0 : Math.min(255, (v - 192) * 4)
      img.data[i * 4 + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
  }, [demap])

  const svgLayer = objectUrl ? (
    <img
      src={objectUrl}
      width={source.width}
      height={source.height}
      alt={t('gradient.view.result')}
      draggable={false}
      className="absolute inset-0 h-full w-full select-none"
    />
  ) : null

  return (
    <PanZoomPreview
      width={source.width}
      height={source.height}
      controls={controls}
      fitLabel={t('gradient.fit')}
      onZoomChange={setZoom}
      busy={busy}
      busyLabel={t('workspace.processing')}
      overlay={
        showHeatmap ? (
          <span className="text-label absolute top-2 left-2 rounded bg-black/50 px-1.5 py-0.5 text-white/80">
            {t('gradient.view.error')}
          </span>
        ) : objectUrl ? (
          <>
            <span className="text-label absolute top-2 left-2 rounded bg-black/50 px-1.5 py-0.5 text-white/80">
              {t('gradient.view.original')}
            </span>
            <span className="text-label absolute top-2 right-2 rounded bg-black/50 px-1.5 py-0.5 text-white/80">
              {t('gradient.view.result')}
            </span>
          </>
        ) : null
      }
    >
      {showHeatmap ? (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full select-none"
          style={{ imageRendering: 'pixelated' }}
        />
      ) : objectUrl ? (
        <CompareSplit
          width={source.width}
          height={source.height}
          zoom={zoom}
          left={<OriginalCanvas source={source} />}
          right={svgLayer}
        />
      ) : (
        <OriginalCanvas source={source} />
      )}
    </PanZoomPreview>
  )
}

function OriginalCanvas({ source }: { source: ImportBitmap }): ReactElement {
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
  return (
    <canvas
      ref={ref}
      className="absolute inset-0 h-full w-full select-none"
      style={{ imageRendering: 'pixelated' }}
    />
  )
}
