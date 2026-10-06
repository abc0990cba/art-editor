import type { Doc } from '../../engine/core/doc.ts'
import {
  FIELD_ALIGN_KINDS,
  FIELD_OFFSET_KINDS,
  FIELD_SIZE_KINDS,
  type FieldAlignKind,
  type FieldOffsetKind,
  type FieldSettings,
  type FieldSizeKind,
} from '../../engine/core/field.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { CheckRow, Chip, Slider } from '../../shared/ui/index.tsx'

type FieldPatch = (patch: Partial<FieldSettings>) => void

const pct = (v: number) => `${Math.round(v * 100)}%`
const deg = (v: number) => `${Math.round(v)}°`

/** Kind chip grid of one modulator; labels come from `style.field.<group>.<kind>` keys. */
function KindChips<K extends string>({
  group,
  kinds,
  value,
  onPick,
}: {
  group: 'size' | 'align' | 'offset'
  kinds: readonly K[]
  value: K
  onPick: (k: K) => void
}) {
  const { t } = useI18n()
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {kinds.map((k) => (
        <Chip
          key={k}
          active={value === k}
          title={t(`style.field.${group}.${k}` as `style.field.size.${FieldSizeKind}`)}
          onClick={() => onPick(k)}
        >
          {t(`style.field.${group}.${k}` as `style.field.size.${FieldSizeKind}`)}
        </Chip>
      ))}
    </div>
  )
}

/** Knobs shared by the active modulators: strength/floor, direction, wavelength, phase, seed. */
function FieldKnobs({ f, onPatch }: { f: FieldSettings; onPatch: FieldPatch }) {
  const { t } = useI18n()
  const periodic =
    ['waveX', 'waveY', 'rings', 'spiral'].includes(f.size) ||
    f.align === 'wave' ||
    f.offset === 'drift'
  const directional = ['rampX', 'rampY', 'waveX', 'waveY'].includes(f.size) || f.offset === 'drift'
  const seeded = f.align === 'truchet' || f.offset === 'scatter'
  return (
    <>
      {f.size !== 'none' && (
        <>
          <Slider
            label={t('style.field.amount')}
            title={t('style.field.amount.desc')}
            value={f.amount}
            min={0}
            max={1}
            step={0.01}
            display={pct}
            onChange={(v) => onPatch({ amount: v })}
          />
          <Slider
            label={t('style.field.min')}
            title={t('style.field.min.desc')}
            value={f.min}
            min={0.05}
            max={1}
            step={0.01}
            display={pct}
            onChange={(v) => onPatch({ min: v })}
          />
          <CheckRow
            label={t('style.field.invert')}
            title={t('style.field.invert.desc')}
            checked={f.invert}
            onChange={(v) => onPatch({ invert: v })}
          />
        </>
      )}
      {directional && (
        <Slider
          label={t('style.field.angle')}
          title={t('style.field.angle.desc')}
          value={f.angle}
          min={0}
          max={359}
          step={1}
          int
          display={deg}
          onChange={(v) => onPatch({ angle: v })}
        />
      )}
      {periodic && (
        <>
          <Slider
            label={t('style.field.period')}
            title={t('style.field.period.desc')}
            value={f.period}
            min={2}
            max={64}
            step={1}
            int
            display={(v) => `${Math.round(v)}`}
            onChange={(v) => onPatch({ period: v })}
          />
          <Slider
            label={t('style.field.phase')}
            title={t('style.field.phase.desc')}
            value={f.phase}
            min={0}
            max={359}
            step={1}
            int
            display={deg}
            onChange={(v) => onPatch({ phase: v })}
          />
        </>
      )}
      {seeded && (
        <div className="text-body flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
          <span title={t('style.field.seed.desc')}>{t('style.field.seed')}</span>
          <div className="flex items-center gap-1.5">
            <span className="text-muted tabular-nums">{f.seed}</span>
            <Chip
              title={t('style.jitterSeed.randomize.desc')}
              onClick={() => onPatch({ seed: 1 + Math.floor(Math.random() * 9999) })}
            >
              {t('style.jitterSeed.randomize')}
            </Chip>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Field group of the pixels-mode style block: grid-wide per-cell modulators (size / align /
 * offset), each driven by a deterministic position field.
 */
export function FieldSection({
  style,
  onApply,
}: {
  style: Doc['style']
  onApply: (patch: Partial<Doc['style']>) => void
}) {
  const { t } = useI18n()
  const f = style.field
  const patchField: FieldPatch = (patch) => onApply({ field: { ...f, ...patch } })
  return (
    <div className="flex flex-col gap-2">
      <div className="text-muted text-overline font-semibold tracking-wider uppercase">
        {t('style.field.title')}
      </div>
      <span className="text-muted text-xs">{t('style.field.size')}</span>
      <KindChips
        group="size"
        kinds={FIELD_SIZE_KINDS}
        value={f.size}
        onPick={(size: FieldSizeKind) => patchField({ size })}
      />
      <span className="text-muted text-xs">{t('style.field.align')}</span>
      <KindChips
        group="align"
        kinds={FIELD_ALIGN_KINDS}
        value={f.align}
        onPick={(align: FieldAlignKind) => patchField({ align })}
      />
      <span className="text-muted text-xs">{t('style.field.offset')}</span>
      <KindChips
        group="offset"
        kinds={FIELD_OFFSET_KINDS}
        value={f.offset}
        onPick={(offset: FieldOffsetKind) => patchField({ offset })}
      />
      <FieldKnobs f={f} onPatch={patchField} />
    </div>
  )
}
