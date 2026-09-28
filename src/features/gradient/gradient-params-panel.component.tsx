import { DEFAULT_GRADIENT_PARAMS, GRADIENT_PRESETS } from '../../engine/gradient/params.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { Chip, Section, Slider } from '../../shared/ui/index.tsx'
import { useStore } from '../../state/editor.store.ts'

/**
 * Right-column control panel of the gradient mode: built-in presets, the fit mode (one gradient per
 * region vs stacked soft spot layers) and the segmentation/fit budgets. Follows the vector params
 * panel pattern.
 */

/** Labeled chip group for enum-ish parameter values. */
function EnumChips<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { v: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted text-xs">{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <Chip key={o.v} active={value === o.v} onClick={() => onChange(o.v)}>
            {o.label}
          </Chip>
        ))}
      </div>
    </div>
  )
}

export function GradientParamsPanel() {
  const { t } = useI18n()
  const params = useStore((s) => s.gradientParams)
  const patch = useStore((s) => s.patchGradientParams)
  const apply = useStore((s) => s.applyGradientParams)
  return (
    <>
      <Section title={t('gradient.preset')} icon="presets" defaultOpen>
        <div className="flex flex-wrap gap-1">
          {GRADIENT_PRESETS.map((p) => (
            <Chip key={p.id} onClick={() => apply({ ...DEFAULT_GRADIENT_PARAMS, ...p.params })}>
              {t(`gradient.preset.${p.id}` as 'gradient.preset.art')}
            </Chip>
          ))}
        </div>
        <EnumChips
          label={t('gradient.mode')}
          value={params.mode}
          options={[
            { v: 'single', label: t('gradient.mode.single') },
            { v: 'stacked', label: t('gradient.mode.stacked') },
          ]}
          onChange={(mode) => patch({ mode })}
        />
      </Section>
      <Section title={t('gradient.fit.section')} icon="color" defaultOpen>
        <Slider
          label={t('gradient.tolerance')}
          title={t('gradient.tolerance.desc')}
          value={params.deltaETolerance}
          min={0.5}
          max={8}
          step={0.5}
          int
          onChange={(deltaETolerance) => patch({ deltaETolerance })}
        />
        <Slider
          label={t('gradient.stops')}
          title={t('gradient.stops.desc')}
          value={params.maxStops}
          min={2}
          max={12}
          onChange={(maxStops) => patch({ maxStops })}
        />
        <Slider
          label={t('gradient.smoothness')}
          title={t('gradient.smoothness.desc')}
          value={params.smoothnessDE}
          min={2}
          max={30}
          onChange={(smoothnessDE) => patch({ smoothnessDE })}
        />
      </Section>
      <Section title={t('gradient.segments.section')} icon="grid" defaultOpen>
        <Slider
          label={t('gradient.cluster')}
          title={t('gradient.cluster.desc')}
          value={params.colorPrecision}
          min={2}
          max={7}
          onChange={(colorPrecision) => patch({ colorPrecision })}
        />
        <Slider
          label={t('gradient.minRegion')}
          title={t('gradient.minRegion.desc')}
          value={params.minRegion}
          min={4}
          max={1024}
          int
          onChange={(minRegion) => patch({ minRegion })}
        />
        <Slider
          label={t('gradient.layers')}
          title={t('gradient.layers.desc')}
          value={params.maxLayers}
          min={0}
          max={32}
          onChange={(maxLayers) => patch({ maxLayers })}
        />
      </Section>
    </>
  )
}
