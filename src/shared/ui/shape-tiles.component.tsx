import { CELL_SHAPES, shapePreviewPath, type CellShapeId } from '../../engine/cell-shapes/index.ts'
import { useI18n } from '../i18n/i18n.provider.tsx'
import { Chip } from './index.tsx'

/**
 * The tile of every registered cell form; icons are drawn by the same engine geometry as the canvas
 * (shapePreviewPath), so a tile always matches the ink it produces. Shared by the Style section
 * picker and the quick brush fab.
 */
export function ShapeTileGrid({
  shape,
  onPick,
  columns = 6,
  tileClassName,
  ariaLabel,
}: {
  shape: CellShapeId
  onPick: (id: CellShapeId) => void
  /** Tiles per row: 6 for the wide right panel, 4 for the narrow fab panel */
  columns?: 4 | 6
  /** Extra classes per tile, e.g. 44px touch sizing in the fab */
  tileClassName?: string
  ariaLabel: string
}) {
  const { t } = useI18n()
  return (
    <div
      role="listbox"
      aria-label={ariaLabel}
      className={`grid gap-1 ${columns === 4 ? 'grid-cols-4' : 'grid-cols-6 max-lg:grid-cols-4'}`}
    >
      {CELL_SHAPES.map((def) => (
        <Chip
          key={def.id}
          active={shape === def.id}
          title={t(`cellform.${def.id}` as 'cellform.square')}
          ariaLabel={t(`cellform.${def.id}` as 'cellform.square')}
          className={`flex items-center justify-center px-0 ${tileClassName ?? ''}`}
          onClick={() => onPick(def.id)}
        >
          <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true">
            <path d={shapePreviewPath(def.id, 24)} fill="currentColor" fillRule="evenodd" />
          </svg>
        </Chip>
      ))}
    </div>
  )
}
