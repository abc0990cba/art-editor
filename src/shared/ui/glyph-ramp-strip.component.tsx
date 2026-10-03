import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { tileCoverage, type GlyphTileSet } from '../../engine/glyph/tiles.ts'

/**
 * Horizontal strip of a glyph set's tone levels rendered as mini canvases: the ramp from empty
 * (white) to full (black). A single scrollable row with edge fades — even a 65-level Bayer ramp
 * stays one navigable line instead of wrapping into a wall — and the selected level scrolls into
 * view. Without `onSelect` the strip is a pure preview (no buttons).
 */
export function GlyphRampStrip({
  set,
  size = 7,
  selected,
  onSelect,
  fadeFrom = 'from-panel',
}: {
  set: GlyphTileSet
  /** Mini tile size in px */
  size?: number
  selected?: number | null
  onSelect?: (level: number) => void
  /** Tailwind `from-*` class of the surface behind the strip, for the edge fades */
  fadeFrom?: string
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const [fadeStart, setFadeStart] = useState(false)
  const [fadeEnd, setFadeEnd] = useState(false)
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

  const update = useCallback(() => {
    const el = listRef.current
    if (!el) return
    setFadeStart(el.scrollLeft > 4)
    setFadeEnd(el.scrollLeft < el.scrollWidth - el.clientWidth - 4)
  }, [])

  useEffect(() => {
    update()
    const el = listRef.current
    if (!el) return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [update, set])

  // navigation selects stay in sight: the chosen level glides to the middle of the strip
  useEffect(() => {
    if (selected == null) return
    listRef.current
      ?.querySelector(`[data-level="${selected}"]`)
      ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [selected, set])

  return (
    <div className="relative">
      <div
        ref={listRef}
        onScroll={update}
        className="flex w-full [scrollbar-width:none] gap-0.5 overflow-x-auto py-0.5 [&::-webkit-scrollbar]:hidden"
        role={onSelect ? 'listbox' : undefined}
        aria-label={set.name}
      >
        {thumbs.map(({ level, url }) => {
          // a faint cell lattice over the scaled tile: empty levels read as glyph grids,
          // not solid dark blobs (only when cells are big enough to carry it)
          const lattice =
            size >= 4
              ? `linear-gradient(to right, rgba(128,128,128,0.28) 1px, transparent 1px),
               linear-gradient(to bottom, rgba(128,128,128,0.28) 1px, transparent 1px), `
              : ''
          const inner = {
            width: size * set.w + 2,
            height: size * set.h + 2,
            backgroundImage: `${lattice}url(${url})`,
            backgroundSize:
              size >= 4 ? `${size}px ${size}px, ${size}px ${size}px, 100% 100%` : '100% 100%',
            imageRendering: 'pixelated',
            backgroundColor: bg,
            // keep the mini tile visible on light backgrounds
            boxShadow: `inset 0 0 0 1px ${tileCoverage(set.levels[level]) > 0.5 ? bg : ink}22`,
          } as const
          const look = `shrink-0 rounded border transition ${
            selected === level
              ? 'border-accent-line ring-accent-line/40 ring-2'
              : 'border-line hover:border-chip-line'
          }`
          return (
            <span
              key={level}
              data-level={level}
              className="flex shrink-0 items-center max-lg:min-h-11"
            >
              {onSelect ? (
                <button
                  type="button"
                  role="option"
                  aria-label={`${level + 1}/${levelCount}`}
                  aria-selected={selected === level}
                  onClick={() => onSelect(level)}
                  title={`${level + 1}/${levelCount}`}
                  className={look}
                  style={inner}
                />
              ) : (
                <span title={`${level + 1}/${levelCount}`} className={look} style={inner} />
              )}
            </span>
          )
        })}
      </div>
      {fadeStart && (
        <div
          className={`pointer-events-none absolute inset-y-0 left-0 w-5 bg-gradient-to-r ${fadeFrom} to-transparent`}
        />
      )}
      {fadeEnd && (
        <div
          className={`pointer-events-none absolute inset-y-0 right-0 w-5 bg-gradient-to-l ${fadeFrom} to-transparent`}
        />
      )}
    </div>
  )
}
