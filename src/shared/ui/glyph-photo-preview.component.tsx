import { useEffect, useMemo, useRef, useState } from 'react'

import { ditherImageWithGlyph, type DitherStyle } from '../../engine/glyph-preview.ts'
import type { GlyphTileSet } from '../../engine/glyph-tiles.ts'
import type { ImportBitmap } from '../../engine/import-image.ts'
import { useI18n } from '../i18n/i18n.provider.tsx'
import { Chip } from './index.tsx'

const DEFAULT_PHOTO_URL = '/glyph-photo-sample.jpg'
const MAX_SOURCE_DIM = 1200
const GRID_OPTIONS = [24, 32, 48, 64, 96, 128, 160]

/** Color modes of the preview: mono print, photo colors, or tinted phosphor/paper pairs. */
const COLOR_MODES: { id: string; style: DitherStyle }[] = [
  { id: 'glyph.preview.mono', style: {} },
  { id: 'glyph.preview.photo', style: { original: true, paper: { r: 250, g: 250, b: 248 } } },
  {
    id: 'glyph.preview.green',
    style: { ink: { r: 15, g: 56, b: 15 }, paper: { r: 155, g: 188, b: 15 } },
  },
  {
    id: 'glyph.preview.amber',
    style: { ink: { r: 255, g: 176, b: 0 }, paper: { r: 32, g: 18, b: 2 } },
  },
  {
    id: 'glyph.preview.blue',
    style: { ink: { r: 223, g: 239, b: 255 }, paper: { r: 29, g: 78, b: 137 } },
  },
]

/** Decode an image source into ImageData, downscaling so the longest side stays bounded. */
function toImageData(img: CanvasImageSource, srcW: number, srcH: number): ImageData | null {
  const scale = Math.min(1, MAX_SOURCE_DIM / Math.max(srcW, srcH))
  const w = Math.max(1, Math.round(srcW * scale))
  const h = Math.max(1, Math.round(srcH * scale))
  const off = document.createElement('canvas')
  off.width = w
  off.height = h
  const ctx = off.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}

/** Procedural fallback so the preview keeps working even without the bundled photo. */
function fallbackImage(): ImageData | null {
  const c = document.createElement('canvas')
  c.width = 640
  c.height = 400
  const g = c.getContext('2d')
  if (!g) return null
  const grad = g.createLinearGradient(0, 0, 640, 400)
  grad.addColorStop(0, '#14181d')
  grad.addColorStop(1, '#e8e8ee')
  g.fillStyle = grad
  g.fillRect(0, 0, 640, 400)
  g.fillStyle = '#f4c542'
  for (let i = 0; i < 4; i++) {
    g.beginPath()
    g.arc(110 + i * 140, 200, 55, 0, Math.PI * 2)
    g.fill()
  }
  return g.getImageData(0, 0, 640, 400)
}

/** Rasterize an imported picture into preview ImageData, downscaled like the bundled sample. */
function importedToImageData(photo: ImportBitmap): ImageData | null {
  const off = document.createElement('canvas')
  off.width = photo.width
  off.height = photo.height
  off
    .getContext('2d')
    ?.putImageData(
      new ImageData(new Uint8ClampedArray(photo.data), photo.width, photo.height),
      0,
      0,
    )
  return toImageData(off, photo.width, photo.height)
}

/**
 * Live photo preview for the glyph gallery: the picture under preview (an imported one when given,
 * otherwise the bundled public-domain sample, replaceable on the fly) dithered through the selected
 * glyph set on a chosen cell grid — the bigger the grid, the finer the dithering.
 */
export function GlyphPhotoPreview({
  set,
  photo,
}: {
  set: GlyphTileSet
  /** Imported picture to preview instead of the bundled sample (the import dialog's case). */
  photo?: ImportBitmap | null
}) {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [sample, setSample] = useState<ImageData | null>(null)
  // coarse by default: individual glyphs read clearly (fine grids melt them into gray)
  const [cols, setCols] = useState(24)
  const [mode, setMode] = useState(COLOR_MODES[0])

  // the imported picture wins over the bundled sample; the sample loads only without one
  const photoData = useMemo(() => (photo ? importedToImageData(photo) : null), [photo])
  const source = photoData ?? sample

  useEffect(() => {
    if (photo) return
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      setSample(toImageData(img, img.width, img.height))
    }
    img.onerror = () => {
      if (cancelled) return
      setSample(fallbackImage())
    }
    img.src = DEFAULT_PHOTO_URL
    return () => {
      cancelled = true
    }
  }, [photo])

  // redraw whenever the selected set or the grid changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !source) return
    canvas.width = source.width
    canvas.height = source.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const out = ditherImageWithGlyph(source, set, cols, mode.style)
    ctx.putImageData(new ImageData(out.data, out.width, out.height), 0, 0)
  }, [source, set, cols, mode])

  const replaceFile = (file: File) => {
    createImageBitmap(file)
      .then((bitmap) => {
        const next = toImageData(bitmap, bitmap.width, bitmap.height)
        bitmap.close()
        if (next) setSample(next)
      })
      .catch(() => {})
  }

  return (
    <div className="flex min-h-0 flex-col gap-1.5 max-lg:shrink-0 lg:flex-1">
      <div className="border-line bg-chip relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border">
        <canvas
          ref={canvasRef}
          className="block max-h-[360px] w-full object-contain max-lg:max-h-[32vh] lg:h-full lg:max-h-full lg:w-auto"
        />
        <span className="text-label absolute top-2 left-2 rounded bg-black/50 px-1.5 py-0.5 text-white/80">
          {set.name}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted text-overline">{t('glyph.preview.color')}</span>
        {COLOR_MODES.map((m) => (
          <Chip
            key={m.id}
            active={mode.id === m.id}
            onClick={() => setMode(m)}
            className="max-lg:min-h-11"
          >
            {t(m.id as 'glyph.preview.mono')}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted text-overline">{t('glyph.preview.grid')}</span>
        {GRID_OPTIONS.map((n) => (
          <Chip key={n} active={cols === n} onClick={() => setCols(n)} className="max-lg:min-h-11">
            {n}
          </Chip>
        ))}
        <span className="flex-1" />
        {/* with an imported picture the replace chip is hidden — the picture is owned
            by the import dialog and swapped there ("Change" in its header) */}
        {!photo && (
          <Chip onClick={() => fileRef.current?.click()} className="max-lg:min-h-11 max-lg:px-3">
            {t('glyph.preview.replace')}
          </Chip>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) replaceFile(file)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
