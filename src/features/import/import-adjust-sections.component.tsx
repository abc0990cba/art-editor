import type { ReactNode } from 'react'

import type { ImportOptions } from '../../engine/import/index.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { Slider } from '../../shared/ui/index.tsx'
import { signed } from './import-controls.util.ts'

/** Collapsible slider group (Adjust / Pre / Post); rows grow to 44px touch targets on phones. */
export function SliderGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="border-line rounded-md border px-2 py-1">
      <summary className="text-muted cursor-pointer text-xs select-none max-lg:flex max-lg:min-h-11 max-lg:items-center max-lg:text-sm">
        {title}
      </summary>
      <div className="mt-1.5 flex flex-col gap-2">{children}</div>
    </details>
  )
}

/** The three collapsible fine-tuning sections of the import dialog (Adjust / Pre / Post). */
export function ImportAdjustSections({
  opts,
  patch,
}: {
  opts: ImportOptions
  patch: (p: Partial<ImportOptions>) => void
}) {
  const { t } = useI18n()
  return (
    <>
      <SliderGroup title={t('import.section.adjust')}>
        <Slider
          label={t('import.brightness')}
          title={t('import.brightness.desc')}
          min={-100}
          max={100}
          value={opts.brightness}
          display={signed}
          onChange={(v) => patch({ brightness: v })}
        />
        <Slider
          label={t('import.contrast')}
          title={t('import.contrast.desc')}
          min={-100}
          max={100}
          value={opts.contrast}
          display={signed}
          onChange={(v) => patch({ contrast: v })}
        />
        <Slider
          label={t('import.saturation')}
          title={t('import.saturation.desc')}
          min={-100}
          max={100}
          value={opts.saturation}
          display={signed}
          onChange={(v) => patch({ saturation: v })}
        />
      </SliderGroup>

      <SliderGroup title={t('import.section.pre')}>
        <Slider
          label={t('import.blur')}
          title={t('import.blur.desc')}
          min={0}
          max={10}
          value={opts.blur}
          onChange={(v) => patch({ blur: v })}
        />
        <Slider
          label={t('import.sharpen')}
          title={t('import.sharpen.desc')}
          min={0}
          max={100}
          value={opts.sharpen}
          display={(v) => `${v}%`}
          onChange={(v) => patch({ sharpen: v })}
        />
        <Slider
          label={t('import.hue')}
          title={t('import.hue.desc')}
          min={-180}
          max={180}
          value={opts.hue}
          display={signed}
          onChange={(v) => patch({ hue: v })}
        />
        <Slider
          label={t('import.preDenoise')}
          title={t('import.preDenoise.desc')}
          min={0}
          max={5}
          value={opts.preDenoise}
          onChange={(v) => patch({ preDenoise: v })}
        />
        <Slider
          label={t('import.preSmooth')}
          title={t('import.preSmooth.desc')}
          min={0}
          max={5}
          value={opts.preSmooth}
          onChange={(v) => patch({ preSmooth: v })}
        />
      </SliderGroup>

      <SliderGroup title={t('import.section.post')}>
        <Slider
          label={t('import.glowRadius')}
          title={t('import.glowRadius.desc')}
          min={0}
          max={24}
          value={opts.glowRadius}
          onChange={(v) => patch({ glowRadius: v })}
        />
        <Slider
          label={t('import.glowIntensity')}
          title={t('import.glowIntensity.desc')}
          min={0}
          max={100}
          value={opts.glowIntensity}
          display={(v) => `${v}%`}
          onChange={(v) => patch({ glowIntensity: v })}
        />
        <Slider
          label={t('import.aberration')}
          title={t('import.aberration.desc')}
          min={0}
          max={12}
          value={opts.aberration}
          onChange={(v) => patch({ aberration: v })}
        />
        <Slider
          label={t('import.postDenoise')}
          title={t('import.postDenoise.desc')}
          min={0}
          max={5}
          value={opts.postDenoise}
          onChange={(v) => patch({ postDenoise: v })}
        />
        <Slider
          label={t('import.postSmooth')}
          title={t('import.postSmooth.desc')}
          min={0}
          max={5}
          value={opts.postSmooth}
          onChange={(v) => patch({ postSmooth: v })}
        />
      </SliderGroup>
    </>
  )
}
