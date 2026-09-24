import type { GlyphTileSet } from '../../engine/glyph-tiles.ts'

/**
 * Pixel grid editor of one tone level: click (or drag) toggles cells. Mirrors the brush tip
 * editor's interaction; a level is w×h boolean cells in row-major order.
 */
export function GlyphTileGrid({
  set,
  level,
  cell = 16,
  onToggle,
}: {
  set: GlyphTileSet
  level: number
  /** Cell size in px */
  cell?: number
  onToggle: (index: number) => void
}) {
  const cells = set.levels[Math.max(0, Math.min(set.levels.length - 1, level))] ?? []
  return (
    <div className="border-line bg-chip inline-block touch-none rounded-md border p-1">
      <div
        className="grid gap-px"
        style={{ gridTemplateColumns: `repeat(${set.w}, ${cell}px)` }}
        onPointerDown={(e) => {
          const target = (e.target as HTMLElement).dataset['cell']
          if (target === undefined) return
          e.preventDefault()
        }}
      >
        {cells.map((on, i) => (
          <button
            key={i}
            type="button"
            data-cell={i}
            aria-label={`${i}`}
            onClick={() => onToggle(i)}
            className={`h-full w-full rounded-[2px] transition ${
              on ? 'bg-indigo-400' : 'bg-app hover:bg-chip-active'
            }`}
            style={{ width: cell, height: cell }}
          />
        ))}
      </div>
    </div>
  )
}
