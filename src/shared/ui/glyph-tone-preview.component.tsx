import { useEffect, useRef } from 'react'

import { glyphRampField, type GlyphTileSet } from '../../engine/glyph-tiles.ts'

const PREVIEW_INK = '#e6e6ea'
const PREVIEW_BG = '#16161c'

/**
 * "In use" preview of a glyph set: a horizontal tone ramp (full ink on the left, empty on the
 * right) rendered through the set's repeating tiles at one canvas pixel per cell and CSS-scaled
 * with crisp pixels. This shows how dithering with the set will actually look — the gallery and the
 * pickers use it as the card visual.
 */
export function GlyphTonePreview({
  set,
  width = 128,
  height = 24,
  className,
}: {
  set: GlyphTileSet
  /** Ramp resolution in cells */
  width?: number
  height?: number
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const field = glyphRampField(set, width, height)
    const img = ctx.createImageData(width, height)
    for (let i = 0; i < field.length; i++) {
      const v = field[i] ? PREVIEW_INK : PREVIEW_BG
      img.data[i * 4] = Number.parseInt(v.slice(1, 3), 16)
      img.data[i * 4 + 1] = Number.parseInt(v.slice(3, 5), 16)
      img.data[i * 4 + 2] = Number.parseInt(v.slice(5, 7), 16)
      img.data[i * 4 + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
  }, [set, width, height])
  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      aria-hidden
      className={className}
      style={{ imageRendering: 'pixelated' }}
    />
  )
}
