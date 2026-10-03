import { useEffect, useRef } from 'react'

import type { GlyphTileSet } from '../../engine/glyph/tiles.ts'

/**
 * Pixel grid editor of one tone level: press and drag to paint (the first cell you touch decides
 * whether the stroke draws or erases). Mirrors the brush tip editor's interaction; a level is w×h
 * boolean cells in row-major order. Wide tiles scroll horizontally instead of squeezing.
 */
export function GlyphTileGrid({
  set,
  level,
  cell = 16,
  onPaint,
}: {
  set: GlyphTileSet
  level: number
  /** Cell size in px */
  cell?: number
  onPaint: (index: number, value: boolean) => void
}) {
  const cells = set.levels[Math.max(0, Math.min(set.levels.length - 1, level))] ?? []
  const painting = useRef<boolean | null>(null)

  // the drag stroke ends even when the pointer is released outside the grid
  useEffect(() => {
    const stop = () => (painting.current = null)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [])

  const cellAt = (target: EventTarget | null): number | null => {
    const idx = (target as HTMLElement | null)?.dataset?.['cell']
    return idx === undefined ? null : Number(idx)
  }

  return (
    <div className="border-line bg-chip inline-block max-w-full touch-none overflow-x-auto rounded-md border p-1">
      <div
        className="bg-line grid w-fit gap-px rounded-sm p-px"
        style={{ gridTemplateColumns: `repeat(${set.w}, ${cell}px)` }}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          const idx = cellAt(e.target)
          if (idx === null) return
          e.preventDefault()
          e.currentTarget.setPointerCapture(e.pointerId)
          const value = !cells[idx]
          painting.current = value
          onPaint(idx, value)
        }}
        onPointerMove={(e) => {
          if (painting.current === null) return
          // pointer capture retargets events to the grid — read the cell under the cursor
          const idx = cellAt(document.elementFromPoint(e.clientX, e.clientY))
          if (idx !== null) onPaint(idx, painting.current)
        }}
      >
        {cells.map((on, i) => (
          <button
            key={i}
            type="button"
            data-cell={i}
            aria-label={`${i}`}
            tabIndex={-1}
            className={`rounded-[2px] transition ${
              on ? 'bg-indigo-400' : 'bg-app hover:bg-chip-active'
            }`}
            style={{ width: cell, height: cell }}
          />
        ))}
      </div>
    </div>
  )
}
