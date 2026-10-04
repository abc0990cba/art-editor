import { hexLuminance } from '../../engine/color/color.ts'
import type { Doc } from '../../engine/core/doc.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { CheckRow, Chip, Slider } from '../../shared/ui/index.tsx'

/** Extrude direction arrows keyed [dy + 1][dx + 1] (screen y grows downward). */
const EXTRUDE_ARROWS = [
  ['↖', '↑', '↗'],
  ['←', '·', '→'],
  ['↙', '↓', '↘'],
]

/**
 * Metaball knob block — also drives the contour mode (same merge field, traced as strokes), so the
 * whole group renders for both and gains the line-width slider in contour.
 */
export function MetaballKnobs({
  mb,
  isSquare,
  contour,
  onPatch,
}: {
  mb: Doc['metaball']
  isSquare: boolean
  contour: boolean
  onPatch: (patch: Partial<Doc['metaball']>) => void
}) {
  const { t } = useI18n()
  const pct = (v: number) => `${Math.round(v * 100)}%`
  return (
    <>
      <div className="text-muted text-overline font-semibold tracking-wider uppercase">
        {t('style.group.metaball')}
      </div>
      <Slider
        label={t('metaball.strength')}
        title={t('metaball.strength.desc')}
        value={mb.strength}
        min={0}
        max={100}
        onChange={(v) => onPatch({ strength: v })}
      />
      <Slider
        label={t('metaball.iso')}
        title={t('metaball.iso.desc')}
        value={mb.iso}
        min={0.2}
        max={0.8}
        step={0.01}
        display={pct}
        onChange={(v) => onPatch({ iso: v })}
      />
      <div className="text-body flex items-center justify-between text-xs">
        <span>{t('metaball.falloff')}</span>
        <div className="flex gap-1">
          {(['tight', 'smooth', 'gooey'] as const).map((f) => (
            <Chip
              key={f}
              active={mb.falloff === f}
              title={t('metaball.falloff.desc')}
              onClick={() => onPatch({ falloff: f })}
            >
              {t(`metaball.falloff.${f}` as 'metaball.falloff.tight')}
            </Chip>
          ))}
        </div>
      </div>
      {isSquare && (
        <>
          <div className="text-body flex items-center justify-between text-xs">
            <span title={t('metaball.unit.desc')}>{t('metaball.unit')}</span>
            <div className="flex gap-1">
              {(['cell', 'block'] as const).map((u) => (
                <Chip
                  key={u}
                  active={mb.unit === u}
                  title={t(`metaball.unit.${u}.desc` as 'metaball.unit.cell.desc')}
                  onClick={() => onPatch({ unit: u })}
                >
                  {t(`metaball.unit.${u}` as 'metaball.unit.cell')}
                </Chip>
              ))}
            </div>
          </div>
          {mb.unit === 'block' && (
            <Slider
              label={t('metaball.blockSize')}
              title={t('metaball.blockSize.desc')}
              value={mb.blockSize}
              min={2}
              max={8}
              step={1}
              int
              display={(v) => `${Math.round(v)}×${Math.round(v)}`}
              onChange={(v) => onPatch({ blockSize: Math.round(v) })}
            />
          )}
        </>
      )}
      <CheckRow
        label={t('metaball.perColor')}
        title={t('metaball.perColor.desc')}
        checked={mb.perColor}
        onChange={(v) => onPatch({ perColor: v })}
      />
      <div className="text-body flex items-center justify-between text-xs">
        <span>{t('metaball.quality')}</span>
        <div className="flex gap-1">
          {([2, 4, 6, 8] as const).map((q, i) => (
            <Chip
              key={q}
              active={mb.quality === q}
              title={t('metaball.quality.desc')}
              onClick={() => onPatch({ quality: q })}
            >
              {
                [
                  t('metaball.quality.low'),
                  t('metaball.quality.med'),
                  t('metaball.quality.high'),
                  t('metaball.quality.ultra'),
                ][i]
              }
            </Chip>
          ))}
        </div>
      </div>
      {isSquare && (
        <CheckRow
          label={t('metaball.squareEdges')}
          title={t('metaball.squareEdges.desc')}
          checked={mb.squareEdges}
          onChange={(v) => onPatch({ squareEdges: v })}
        />
      )}
      {isSquare && (
        <CheckRow
          label={t('metaball.fuseAll')}
          title={t('metaball.fuseAll.desc')}
          checked={mb.fuseAll}
          onChange={(v) => onPatch({ fuseAll: v })}
        />
      )}
      {contour && (
        <Slider
          label={t('metaball.strokeWidth')}
          title={t('metaball.strokeWidth.desc')}
          value={mb.strokeWidth}
          min={0.05}
          max={1}
          step={0.01}
          display={pct}
          onChange={(v) => onPatch({ strokeWidth: v })}
        />
      )}
    </>
  )
}

/** Extrude knob block: body depth, 8-way direction pad and the body color. */
export function ExtrudeKnobs({
  ex,
  palette,
  onPatch,
}: {
  ex: Doc['extrude']
  palette: readonly string[]
  onPatch: (patch: Partial<Doc['extrude']>) => void
}) {
  const { t } = useI18n()
  return (
    <>
      <div className="text-muted text-overline font-semibold tracking-wider uppercase">
        {t('style.group.extrude')}
      </div>
      <Slider
        label={t('extrude.depth')}
        title={t('extrude.depth.desc')}
        value={ex.depth}
        min={1}
        max={8}
        step={1}
        int
        display={(v) => String(Math.round(v))}
        onChange={(v) => onPatch({ depth: Math.round(v) })}
      />
      <div className="text-body flex items-center justify-between text-xs">
        <span title={t('extrude.dir.desc')}>{t('extrude.dir')}</span>
        <div className="grid grid-cols-3 gap-1" role="group" aria-label={t('extrude.dir')}>
          {([-1, 0, 1] as const).map((dy) =>
            ([-1, 0, 1] as const).map((dx) =>
              dx === 0 && dy === 0 ? (
                <span key={`${dx}${dy}`} />
              ) : (
                <Chip
                  key={`${dx}${dy}`}
                  active={ex.dx === dx && ex.dy === dy}
                  title={t('extrude.dir.desc')}
                  onClick={() => onPatch({ dx, dy })}
                >
                  {EXTRUDE_ARROWS[dy + 1][dx + 1]}
                </Chip>
              ),
            ),
          )}
        </div>
      </div>
      <div className="text-body flex items-center justify-between text-xs">
        <span title={t('extrude.color.desc')}>{t('extrude.color')}</span>
        <div className="flex flex-wrap items-center justify-end gap-1">
          <Chip
            active={ex.color === 0}
            title={t('extrude.color.auto.desc')}
            onClick={() => onPatch({ color: 0 })}
          >
            {t('extrude.color.auto')}
          </Chip>
          {palette.map((c, i) => (
            <button
              key={`${c}-${i}`}
              type="button"
              title={c}
              aria-label={t('extrude.color')}
              aria-pressed={ex.color === i + 1}
              onClick={() => onPatch({ color: i + 1 })}
              className={`border-line h-7 w-7 rounded-md border transition max-lg:h-11 max-lg:w-11 ${
                ex.color === i + 1
                  ? 'ring-accent-text ring-offset-panel ring-2 ring-offset-1'
                  : 'hover:brightness-110'
              }`}
              style={{
                background: c,
                boxShadow: `inset 0 0 0 1px ${
                  hexLuminance(c) > 0.55 ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.75)'
                }`,
              }}
            />
          ))}
        </div>
      </div>
    </>
  )
}
