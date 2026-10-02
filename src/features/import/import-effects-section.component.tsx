import { DITHER_CATALOG, type ImportDither } from '../../engine/dither-catalog.ts'
import type { ImportOptions } from '../../engine/import-image.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { CheckRow, ColorInput, Section, Slider, TextField } from '../../shared/ui/index.tsx'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../../shared/ui/shadcn/select.tsx'
import { DITHER_GROUPS, SELECT_TRIGGER } from './import-controls.util.ts'

/**
 * Effect-combo controls of the import dialog: the hybrid band pickers, posterize bands, the custom
 * ASCII ramp, the gradient-map duotone pair and the edge-outline overlay. Shown under the dither
 * field; hybrid/posterize/ascii rows appear only for their dither.
 */
export function ImportEffectsSection({
  opts,
  patch,
}: {
  opts: ImportOptions
  patch: (p: Partial<ImportOptions>) => void
}) {
  const { t } = useI18n()
  const bandSelect = (label: string, key: 'hybridLow' | 'hybridMid' | 'hybridHigh') => (
    <label className="text-body flex items-center justify-between gap-2 text-xs">
      <span className="text-muted">{label}</span>
      <Select value={opts[key]} onValueChange={(v) => patch({ [key]: v as ImportDither })}>
        <SelectTrigger className={SELECT_TRIGGER}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DITHER_GROUPS.filter((g) => g.dithers.length > 0).map((g) => (
            <SelectGroup key={g.label}>
              <SelectLabel className="text-muted text-overline">{t(g.label)}</SelectLabel>
              {g.dithers.map((d) => (
                <SelectItem key={d} value={d} disabled={DITHER_CATALOG[d].family === 'hybrid'}>
                  {t(`import.dither.${d}` as 'import.dither.none')}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
  return (
    <Section title={t('import.section.effects')} icon="glyph">
      {opts.dither === 'hybrid' && (
        <>
          {bandSelect(t('import.hybrid.shadows'), 'hybridLow')}
          {bandSelect(t('import.hybrid.mids'), 'hybridMid')}
          {bandSelect(t('import.hybrid.highlights'), 'hybridHigh')}
          <Slider
            label={t('import.bandLow')}
            title={t('import.bandLow.desc')}
            min={0}
            max={254}
            value={opts.bandLow}
            onChange={(v) => patch({ bandLow: Math.min(v, opts.bandHigh - 1) })}
          />
          <Slider
            label={t('import.bandHigh')}
            title={t('import.bandHigh.desc')}
            min={1}
            max={255}
            value={opts.bandHigh}
            onChange={(v) => patch({ bandHigh: Math.max(v, opts.bandLow + 1) })}
          />
        </>
      )}
      {opts.dither === 'posterize' && (
        <Slider
          label={t('import.posterizeLevels')}
          title={t('import.posterizeLevels.desc')}
          min={2}
          max={32}
          value={opts.posterizeLevels}
          onChange={(v) => patch({ posterizeLevels: v })}
        />
      )}
      {opts.dither === 'ascii' && (
        <label className="text-body flex flex-col gap-1 text-xs">
          <span className="text-muted" title={t('import.asciiRamp.desc')}>
            {t('import.asciiRamp')}
          </span>
          <TextField
            value={opts.asciiRamp ?? ''}
            placeholder=" .:-=+*#%@"
            ariaLabel={t('import.asciiRamp')}
            onChange={(v) => patch({ asciiRamp: v.trim().length > 1 ? v : null })}
          />
        </label>
      )}
      <CheckRow
        label={t('import.duotone')}
        title={t('import.duotone.desc')}
        checked={opts.duotone !== null}
        onChange={(on) => patch({ duotone: on ? { dark: '#101018', light: '#f2ede4' } : null })}
      />
      {opts.duotone && (
        <div className="flex gap-3">
          <ColorInput
            value={opts.duotone.dark}
            onChange={(hex) => patch({ duotone: { dark: hex, light: opts.duotone!.light } })}
            title={t('import.duotone.dark')}
          />
          <ColorInput
            value={opts.duotone.light}
            onChange={(hex) => patch({ duotone: { dark: opts.duotone!.dark, light: hex } })}
            title={t('import.duotone.light')}
          />
        </div>
      )}
      <Slider
        label={t('import.edgeOutline')}
        title={t('import.edgeOutline.desc')}
        min={0}
        max={100}
        value={opts.edgeOutline}
        onChange={(v) => patch({ edgeOutline: v })}
      />
    </Section>
  )
}
