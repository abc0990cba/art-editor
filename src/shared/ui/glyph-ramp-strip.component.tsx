import { useMemo } from 'react'

import { tileCoverage, type GlyphTileSet } from '../../engine/glyph-tiles.ts'

/**
 * Horizontal strip of a glyph set's tone levels rendered as mini canvases: the ramp from empty
 * (white) to full (black). Selected level is highlighted; click selects.
 */
export function GlyphRampStrip({
  set,
  size = 7,
  selected,
  onSelect,
}: {
  set: GlyphTileSet
  /** Mini tile size in px */
  size?: number
  selected?: number | null
  onSelect?: (level: number) => void
}) {
  const levelCount = set.levels.length
  const ink = '#e6e6ea'
  const bg = '#16161c'
  const thumbs = useMemo(
    () =>
      set.levels.map((cells, level) => {
        const canvas = document.createElement('canvas')
        canvas.width = set.w
        canvas.height = set.h
        const ctx = canvas.getContext('2d')
        if (ctx) {
          const img = ctx.createImageData(set.w, set.h)
          for (let i = 0; i < cells.length; i++) {
            const v = cells[i] ? 255 : 0
            img.data[i * 4] = v
            img.data[i * 4 + 1] = v
            img.data[i * 4 + 2] = v
            img.data[i * 4 + 3] = 255
          }
          ctx.putImageData(img, 0, 0)
        }
        return { level, url: canvas.toDataURL() }
      }),
    [set],
  )
  return (
    <div className="flex flex-wrap gap-0.5" role="listbox" aria-label={set.name}>
      {thumbs.map(({ level, url }) => (
        <button
          key={level}
          type="button"
          aria-label={`${level + 1}/${levelCount}`}
          onClick={() => onSelect?.(level)}
          title={`${level + 1}/${levelCount}`}
          className={`shrink-0 rounded border transition ${
            selected === level ? 'border-accent-line' : 'border-line hover:border-chip-line'
          }`}
          style={{
            width: size * set.w + 2,
            height: size * set.h + 2,
            backgroundImage: `url(${url})`,
            backgroundSize: '100% 100%',
            imageRendering: 'pixelated',
            backgroundColor: bg,
            // keep the mini tile visible on light backgrounds
            boxShadow: `inset 0 0 0 1px ${tileCoverage(set.levels[level]) > 0.5 ? bg : ink}22`,
          }}
        />
      ))}
    </div>
  )
}
