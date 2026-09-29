import { CELL_SHAPES, isCurvedShape, paramsOf, shapePreviewPath } from '../../engine/cell-shapes.ts'
import type { Doc } from '../../engine/doc.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { Chip, Slider } from '../../shared/ui/index.tsx'

/**
 * Cell-form picker for `pixels` mode: one tile per registered shape plus the sliders for the params
 * that shape exposes (thickness / points / rotation). Tiles draw through the same engine geometry
 * as the canvas (shapePreviewPath), so the icon always matches the ink.
 */
export function ShapePicker({
  style,
  onApply,
}: {
  style: Doc['style']
  onApply: (patch: Partial<Doc['style']>) => void
}) {
  const { t } = useI18n()
  const shape = style.shape
  const p = style.shapeParams
  const params = paramsOf(shape)
  const patchParams = (patch: Partial<Doc['style']['shapeParams']>) =>
    onApply({ shapeParams: { ...p, ...patch } })
  const pct = (v: number) => `${Math.round(v * 100)}%`
  const deg = (v: number) => `${Math.round(v)}°`

  return (
    <div className="flex flex-col gap-2">
      <div
        role="listbox"
        aria-label={t('style.shape')}
        className="grid grid-cols-6 gap-1 max-lg:grid-cols-4"
      >
        {CELL_SHAPES.map((def) => (
          <Chip
            key={def.id}
            active={shape === def.id}
            title={t(`cellform.${def.id}` as 'cellform.square')}
            ariaLabel={t(`cellform.${def.id}` as 'cellform.square')}
            className="flex items-center justify-center px-0"
            onClick={() => onApply({ shape: def.id })}
          >
            <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true">
              <path d={shapePreviewPath(def.id, 24)} fill="currentColor" fillRule="evenodd" />
            </svg>
          </Chip>
        ))}
      </div>
      {params.includes('rotation') && (
        <Slider
          label={t('style.shape.rotation')}
          title={t('style.shape.rotation.desc')}
          value={p.rotation}
          min={0}
          max={359}
          step={1}
          int
          display={deg}
          onChange={(v) => patchParams({ rotation: v })}
        />
      )}
      {params.includes('thickness') && (
        <Slider
          label={t('style.shape.thickness')}
          title={t('style.shape.thickness.desc')}
          value={p.thickness}
          min={0.05}
          max={0.5}
          step={0.01}
          display={pct}
          onChange={(v) => patchParams({ thickness: v })}
        />
      )}
      {params.includes('points') && (
        <Slider
          label={t('style.shape.points')}
          title={t('style.shape.points.desc')}
          value={p.points}
          min={3}
          max={12}
          step={1}
          int
          display={(v) => String(v)}
          onChange={(v) => patchParams({ points: v })}
        />
      )}
      {isCurvedShape(shape) && (
        <p className="text-muted text-overline">{t('style.shape.curvedHint')}</p>
      )}
    </div>
  )
}
