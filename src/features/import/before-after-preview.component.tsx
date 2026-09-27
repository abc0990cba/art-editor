import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import type { ImportBitmap, ImportFit, ImportResult } from '../../engine/import-image.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'

interface Rgb {
  r: number
  g: number
  b: number
}

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

/** Paint the converted cells at 1:1 (cols×sub, rows×sub); empty cells stay transparent. */
function paintResult(
  ctx: CanvasRenderingContext2D,
  result: ImportResult,
  rgbOf: Map<string, Rgb>,
  sub: number,
): void {
  const w = result.cols * sub
  const h = result.rows * sub
  const img = ctx.createImageData(w, h)
  for (let i = 0; i < result.cells.length; i++) {
    const v = result.cells[i]
    if (v === 0) continue
    const rgb = rgbOf.get(result.palette[(v - 1) % result.palette.length])
    if (!rgb) continue
    img.data[i * 4] = rgb.r
    img.data[i * 4 + 1] = rgb.g
    img.data[i * 4 + 2] = rgb.b
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
}

/**
 * Before/after comparison preview, the photo-editor standard: the original sits under the result,
 * and a draggable divider (left = original, right = result) sweeps across the whole picture. Drag
 * anywhere on the picture, grab the handle, or focus it and use the arrow keys.
 */
export function BeforeAfterPreview({
  bitmap,
  result,
  rgbOf,
  sub,
  fit,
  backgroundStyle,
}: {
  bitmap: ImportBitmap
  result: ImportResult | null
  /** Result palette hex → rgb, kept in the dialog */
  rgbOf: Map<string, Rgb>
  /** Result cell size in screen pixels (doc.sub) */
  sub: number
  /** Placement option — both sides are mapped with it, so the divider compares like with like */
  fit: ImportFit
  /** Checkerboard style for transparent pixels */
  backgroundStyle: CSSProperties
}) {
  const { t } = useI18n()
  const boxRef = useRef<HTMLDivElement>(null)
  const originalRef = useRef<HTMLCanvasElement>(null)
  const resultRef = useRef<HTMLCanvasElement>(null)
  const [split, setSplit] = useState(50)
  const dragging = useRef(false)

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
  useEffect(() => {
    const canvas = originalRef.current
    if (!canvas) return
    const w = result ? result.cols * sub : bitmap.width
    const h = result ? result.rows * sub : bitmap.height
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (result) {
      drawFittedOriginal(ctx, srcCanvas, w, h, fit)
    } else {
      // no conversion yet: the original at its own pixel size, letterboxed by CSS
      ctx.drawImage(srcCanvas, 0, 0)
    }
  }, [bitmap, srcCanvas, result, sub, fit])

  // the result renders at grid resolution; cells paint 1:1, CSS scales with crisp pixels
  useEffect(() => {
    const canvas = resultRef.current
    if (!canvas || !result) return
    const w = result.cols * sub
    const h = result.rows * sub
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    paintResult(ctx, result, rgbOf, sub)
  }, [result, rgbOf, sub])

  const updateFromClientX = useCallback((clientX: number) => {
    const box = boxRef.current
    if (!box) return
    const r = box.getBoundingClientRect()
    const pct = ((clientX - r.left) / r.width) * 100
    setSplit(Math.max(0, Math.min(100, pct)))
  }, [])

  return (
    <div
      ref={boxRef}
      className="relative h-full w-full cursor-ew-resize touch-none select-none"
      style={backgroundStyle}
      onPointerDown={(e) => {
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
    >
      {/* original (under) */}
      <canvas
        ref={originalRef}
        className="absolute inset-0 h-full w-full object-contain"
        style={backgroundStyle}
        aria-hidden
      />
      {/* result (over), clipped to the right of the divider */}
      <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
        <canvas
          ref={resultRef}
          className="absolute inset-0 h-full w-full object-contain"
          style={{ ...backgroundStyle, imageRendering: 'pixelated' }}
          aria-hidden
        />
      </div>

      {/* divider + handle */}
      <div
        className="pointer-events-none absolute inset-y-0 w-px bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
        style={{ left: `${split}%` }}
        aria-hidden
      />
      <button
        type="button"
        role="slider"
        aria-label={t('import.split.desc')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(split)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 2
          if (e.key === 'ArrowLeft') setSplit((v) => Math.max(0, v - step))
          else if (e.key === 'ArrowRight') setSplit((v) => Math.min(100, v + step))
          else return
          e.preventDefault()
        }}
        className="border-line bg-raised text-body absolute top-1/2 z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border shadow-md"
        style={{ left: `${split}%` }}
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

      {/* corner badges telling which side is which */}
      <span className="text-label absolute top-2 left-2 rounded bg-black/50 px-1.5 py-0.5 text-white/80">
        {t('import.original')}
      </span>
      <span className="text-label absolute top-2 right-2 rounded bg-black/50 px-1.5 py-0.5 text-white/80">
        {t('import.result')}
      </span>
    </div>
  )
}
