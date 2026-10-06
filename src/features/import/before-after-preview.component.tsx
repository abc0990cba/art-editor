import { useEffect, useMemo, useRef, useState } from 'react'

import type { ImportBitmap, ImportFit, ImportResult } from '../../engine/import/index.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { CompareSplit } from '../../shared/ui/compare-split.component.tsx'
import { PanZoomPreview } from '../../shared/ui/pan-zoom-preview.component.tsx'
import { paintResult, type Rgb } from './import-controls.util.ts'

/**
 * Draw the source photo into the result's geometry — the same cover-crop / contain-letterbox /
 * stretch mapping convertImage used — so both preview sides cover the same picture regions.
 */
function drawFittedOriginal(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  w: number,
  h: number,
  fit: ImportFit,
): void {
  const W = src.width
  const H = src.height
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.clearRect(0, 0, w, h)
  if (fit === 'cover') {
    // crop the source to the target aspect, centered — same as fitToGrid
    const s = Math.max(w / W, h / H)
    ctx.drawImage(src, (W - w / s) / 2, (H - h / s) / 2, w / s, h / s, 0, 0, w, h)
  } else if (fit === 'contain') {
    // letterbox a scaled-to-fit copy inside the grid
    const s = Math.min(w / W, h / H)
    ctx.drawImage(src, (w - W * s) / 2, (h - H * s) / 2, W * s, H * s)
  } else {
    // stretch — and 'resize', whose grid already matches the photo proportions
    ctx.drawImage(src, 0, 0, W, H, 0, 0, w, h)
  }
}

/**
 * Before/after comparison preview, the photo-editor standard, on the shared zoom/pan viewport (the
 * same one as the tracer previews): the original sits under the result and a divider (left =
 * original, right = result) sweeps across the picture — move it by the round handle or the arrow
 * keys, while drag pans and pinch/wheel zooms.
 */
export function BeforeAfterPreview({
  bitmap,
  result,
  rgbOf,
  sub,
  fit,
}: {
  bitmap: ImportBitmap
  result: ImportResult | null
  /** Result palette hex → rgb, kept in the dialog */
  rgbOf: Map<string, Rgb>
  /** Result cell size in screen pixels (doc.sub) */
  sub: number
  /** Placement option — both sides are mapped with it, so the divider compares like with like */
  fit: ImportFit
}) {
  const { t } = useI18n()
  const originalRef = useRef<HTMLCanvasElement>(null)
  const resultRef = useRef<HTMLCanvasElement>(null)
  const [zoom, setZoom] = useState(1)

  // source pixels cached on a canvas so drawImage can resample them per geometry change
  const srcCanvas = useMemo(() => {
    const src = document.createElement('canvas')
    src.width = bitmap.width
    src.height = bitmap.height
    src
      .getContext('2d')
      ?.putImageData(
        new ImageData(new Uint8ClampedArray(bitmap.data), bitmap.width, bitmap.height),
        0,
        0,
      )
    return src
  }, [bitmap])

  // both sides render in the RESULT's geometry — same canvas size (cols×sub, rows×sub) and the
  // same placement mapping — so the divider always compares like with like
  const w = result ? result.cols * sub : bitmap.width
  const h = result ? result.rows * sub : bitmap.height

  useEffect(() => {
    const canvas = originalRef.current
    if (!canvas) return
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (result) {
      drawFittedOriginal(ctx, srcCanvas, w, h, fit)
    } else {
      // no conversion yet: the original at its own pixel size
      ctx.drawImage(srcCanvas, 0, 0)
    }
  }, [bitmap, srcCanvas, result, sub, fit, w, h])

  // the result renders at grid resolution; cells paint 1:1, CSS scales with crisp pixels
  useEffect(() => {
    const canvas = resultRef.current
    if (!canvas || !result) return
    canvas.width = result.cols * sub
    canvas.height = result.rows * sub
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    paintResult(ctx, result, rgbOf, sub)
  }, [result, rgbOf, sub])

  return (
    <PanZoomPreview
      width={w}
      height={h}
      fitLabel={t('view.fit')}
      onZoomChange={setZoom}
      overlay={
        <>
          <span className="text-label absolute top-2 left-2 rounded bg-black/50 px-1.5 py-0.5 text-white/80">
            {t('import.original')}
          </span>
          <span className="text-label absolute top-2 right-2 rounded bg-black/50 px-1.5 py-0.5 text-white/80">
            {t('import.result')}
          </span>
        </>
      }
    >
      <CompareSplit
        width={w}
        height={h}
        zoom={zoom}
        left={
          <canvas
            ref={originalRef}
            className="absolute inset-0 h-full w-full select-none"
            aria-hidden
          />
        }
        right={
          <canvas
            ref={resultRef}
            className="absolute inset-0 h-full w-full select-none"
            style={{ imageRendering: 'pixelated' }}
            aria-hidden
          />
        }
      />
    </PanZoomPreview>
  )
}
