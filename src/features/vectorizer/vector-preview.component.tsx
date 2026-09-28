import { useEffect, useRef, useState } from 'react'

import type { ImportBitmap } from '../../engine/import-image.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { CompareSplit } from '../../shared/ui/compare-split.component.tsx'
import { PanZoomPreview } from '../../shared/ui/pan-zoom-preview.component.tsx'

/**
 * Zoom/pan preview of the vector workspace: with a trace result it shows the original raster and
 * the traced SVG stacked in one place with a draggable divider (the import-dialog comparison);
 * before the first result — just the original. The SVG lands in an <img> via a blob URL so browser
 * scaling stays smooth and the markup can't leak styles into the app.
 */
export function VectorPreview({
  source,
  svg,
  controls = true,
  busy = false,
}: {
  source: ImportBitmap
  svg: string | null
  /** Zoom/fit plates; the compact preview inside the params sheet hides them */
  controls?: boolean
  /** A trace is running: the shown result is stale and about to be replaced */
  busy?: boolean
}) {
  const { t } = useI18n()
  const [zoom, setZoom] = useState(1)
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

  return (
    <PanZoomPreview
      width={source.width}
      height={source.height}
      controls={controls}
      fitLabel={t('vector.fit')}
      onZoomChange={setZoom}
      busy={busy}
      busyLabel={t('workspace.processing')}
      overlay={
        objectUrl ? (
          <>
            <span className="text-label absolute top-2 left-2 rounded bg-black/50 px-1.5 py-0.5 text-white/80">
              {t('vector.original')}
            </span>
            <span className="text-label absolute top-2 right-2 rounded bg-black/50 px-1.5 py-0.5 text-white/80">
              {t('vector.result')}
            </span>
          </>
        ) : null
      }
    >
      {objectUrl ? (
        <CompareSplit
          width={source.width}
          height={source.height}
          zoom={zoom}
          left={<SourceCanvas source={source} />}
          right={
            <img
              src={objectUrl}
              width={source.width}
              height={source.height}
              alt={t('vector.result')}
              draggable={false}
              className="absolute inset-0 h-full w-full select-none"
            />
          }
        />
      ) : (
        <SourceCanvas source={source} />
      )}
    </PanZoomPreview>
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
  return (
    <canvas
      ref={ref}
      className="absolute inset-0 h-full w-full select-none"
      style={{ imageRendering: 'pixelated' }}
    />
  )
}
