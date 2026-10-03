import type { Doc } from '../../engine/core/doc.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { CheckRow, Chip, Slider } from '../../shared/ui/index.tsx'

/**
 * Corner rounding of the square cell form: the square/rounded/circle preset chips, the arc/chamfer
 * corner style and the per-corner radius overrides. Hidden entirely while a non-square cell form is
 * selected (polygons reuse `radius` directly, curved forms ignore it).
 */
export function RoundingControls({
  style,
  isSquareGrid,
  onApply,
}: {
  style: Doc['style']
  isSquareGrid: boolean
  onApply: (patch: Partial<Doc['style']>) => void
}) {
  const { t } = useI18n()
  const c = style.corners
  const pct = (v: number) => `${Math.round(v * 100)}%`
  const allCorners = { tl: null, tr: null, br: null, bl: null }

  return (
    <>
      <Slider
        label={t('style.radius')}
        title={t('style.radius.desc')}
        value={style.radius}
        min={0}
        max={0.5}
        step={0.01}
        display={pct}
        onChange={(v) => onApply({ radius: v })}
      />
      <div className="text-muted flex items-center justify-between text-xs">
        <span>{t('style.cornerStyle')}</span>
        <div className="flex gap-1">
          {(
            [
              ['arc', 'style.corner.arc'],
              ['chamfer', 'style.corner.chamfer'],
            ] as const
          ).map(([cs, key]) => (
            <Chip
              key={cs}
              active={style.cornerStyle === cs}
              title={t(`style.corner.${cs}.desc` as 'style.corner.arc.desc')}
              onClick={() => onApply({ cornerStyle: cs })}
            >
              {t(key)}
            </Chip>
          ))}
        </div>
      </div>
      {isSquareGrid && (
        <CheckRow
          label={t('style.squareEdges')}
          title={t('style.squareEdges.desc')}
          checked={style.squareEdges}
          onChange={(v) => onApply({ squareEdges: v })}
        />
      )}
      <div className="text-muted text-overline font-semibold tracking-wider uppercase">
        {t('style.group.rounding')}
      </div>
      <div className="flex gap-1.5">
        <Chip
          active={style.radius === 0 && c.tl === null}
          title={t('style.square.desc')}
          onClick={() => onApply({ radius: 0, corners: { ...allCorners } })}
        >
          {t('style.square')}
        </Chip>
        <Chip
          active={style.radius > 0 && style.radius < 0.5 && c.tl === null}
          title={t('style.rounded.desc')}
          onClick={() => onApply({ radius: 0.42, corners: { ...allCorners } })}
        >
          {t('style.rounded')}
        </Chip>
        <Chip
          active={style.radius === 0.5 && c.tl === null}
          title={t('style.circle.desc')}
          onClick={() => onApply({ radius: 0.5, corners: { ...allCorners } })}
        >
          {t('style.circle')}
        </Chip>
      </div>
      {isSquareGrid && (
        <>
          <CheckRow
            label={t('style.perCorner')}
            title={t('style.perCorner.desc')}
            checked={c.tl !== null}
            onChange={(on) =>
              onApply({
                corners: {
                  tl: on ? 0 : null,
                  tr: on ? 0 : null,
                  br: on ? 0 : null,
                  bl: on ? 0 : null,
                },
              })
            }
          />
          {c.tl !== null && (
            <div className="border-line bg-chip flex flex-col gap-2 rounded-lg border p-2">
              <Slider
                label="↖"
                value={c.tl}
                min={0}
                max={0.5}
                step={0.01}
                display={pct}
                onChange={(v) => onApply({ corners: { ...c, tl: v } })}
              />
              <Slider
                label="↗"
                value={c.tr ?? 0}
                min={0}
                max={0.5}
                step={0.01}
                display={pct}
                onChange={(v) => onApply({ corners: { ...c, tr: v } })}
              />
              <Slider
                label="↘"
                value={c.br ?? 0}
                min={0}
                max={0.5}
                step={0.01}
                display={pct}
                onChange={(v) => onApply({ corners: { ...c, br: v } })}
              />
              <Slider
                label="↙"
                value={c.bl ?? 0}
                min={0}
                max={0.5}
                step={0.01}
                display={pct}
                onChange={(v) => onApply({ corners: { ...c, bl: v } })}
              />
            </div>
          )}
        </>
      )}
    </>
  )
}
