import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { CheckRow, Chip, Slider } from '../../shared/ui/index.tsx'
import { useStore, type ToolOpts } from '../../state/editor.store.ts'
import type { NumericOptKey } from '../../state/tools.slice.ts'

/** Skull tool body: style presets plus a dense group of editable knobs. */
export function SkullSettings() {
  const { t } = useI18n()
  const opts = useStore((s) => s.toolOpts)
  const patch = useStore((s) => s.patchToolOpts)
  const setOpt = (k: NumericOptKey, v: number) => patch({ [k]: v } as Partial<ToolOpts>)
  // style presets patch several knobs at once; every knob stays editable after
  const preset = (label: string, p: Partial<ToolOpts>) => (
    <Chip key={label} onClick={() => patch(p)}>
      {label}
    </Chip>
  )
  const row = (label: string, k: NumericOptKey, min: number, max: number, step = 0.01) => (
    <Slider
      label={label}
      value={opts[k] as number}
      min={min}
      max={max}
      step={step}
      editable
      int={step >= 1}
      onChange={(v) => setOpt(k, v)}
    />
  )
  const chips = (
    label: string,
    cur: string,
    vals: [string, string][],
    pick: (v: string) => void,
  ) => (
    <div className="text-body flex items-center justify-between gap-2 text-xs">
      <span className="text-muted">{label}</span>
      <div className="flex flex-wrap justify-end gap-1">
        {vals.map(([v, key]) => (
          <Chip key={v} active={cur === v} onClick={() => pick(v)}>
            {t(key as never)}
          </Chip>
        ))}
      </div>
    </div>
  )
  const group = (label: string) => (
    <div className="text-muted text-overline font-semibold tracking-wider uppercase">{label}</div>
  )
  return (
    <>
      <div className="flex flex-wrap gap-1">
        {preset(t('skull.preset.anatomic'), {
          skullCraniumWidth: 1,
          skullCraniumHeight: 0.6,
          skullCrown: 'round',
          skullBrowRidge: 0.03,
          skullCheekWidth: 0.92,
          skullJawWidth: 0.72,
          skullJawHeight: 0.22,
          skullMandible: true,
          skullEyeSize: 0.16,
          skullEyeSpacing: 0.26,
          skullEyeY: 0.48,
          skullEyeShape: 'round',
          skullEyeTilt: 0,
          skullEyeAsym: 0,
          skullNoseWidth: 0.09,
          skullNoseHeight: 0.11,
          skullNoseY: 0.63,
          skullNoseShape: 'triangle',
          skullTeethCount: 8,
          skullTeethLen: 0.08,
          skullTeethGap: 0.35,
          skullTeethShape: 'rect',
          skullMouthY: 0.82,
        })}
        {preset(t('skull.preset.cartoon'), {
          skullCraniumWidth: 1.15,
          skullCraniumHeight: 0.66,
          skullCrown: 'round',
          skullBrowRidge: 0,
          skullCheekWidth: 0.8,
          skullJawWidth: 0.55,
          skullJawHeight: 0.16,
          skullMandible: true,
          skullEyeSize: 0.24,
          skullEyeSpacing: 0.3,
          skullEyeY: 0.5,
          skullEyeShape: 'round',
          skullEyeTilt: 0,
          skullEyeAsym: 0,
          skullNoseWidth: 0.07,
          skullNoseHeight: 0.08,
          skullNoseY: 0.64,
          skullNoseShape: 'heart',
          skullTeethCount: 6,
          skullTeethLen: 0.06,
          skullTeethGap: 0.2,
          skullTeethShape: 'rounded',
          skullMouthY: 0.84,
        })}
        {preset(t('skull.preset.demon'), {
          skullCraniumWidth: 1,
          skullCraniumHeight: 0.58,
          skullCrown: 'flat',
          skullBrowRidge: 0.08,
          skullCheekWidth: 1.02,
          skullJawWidth: 0.6,
          skullJawHeight: 0.24,
          skullMandible: true,
          skullEyeSize: 0.14,
          skullEyeSpacing: 0.28,
          skullEyeY: 0.47,
          skullEyeShape: 'angled',
          skullEyeTilt: 0.9,
          skullEyeAsym: 0,
          skullNoseWidth: 0.05,
          skullNoseHeight: 0.16,
          skullNoseY: 0.62,
          skullNoseShape: 'slit',
          skullTeethCount: 10,
          skullTeethLen: 0.1,
          skullTeethGap: 0.6,
          skullTeethShape: 'fangs',
          skullMouthY: 0.8,
        })}
        {preset(t('skull.preset.alien'), {
          skullCraniumWidth: 1.2,
          skullCraniumHeight: 0.72,
          skullCrown: 'round',
          skullBrowRidge: 0,
          skullCheekWidth: 0.7,
          skullJawWidth: 0.42,
          skullJawHeight: 0.12,
          skullMandible: true,
          skullEyeSize: 0.24,
          skullEyeSpacing: 0.34,
          skullEyeY: 0.46,
          skullEyeShape: 'oval',
          skullEyeTilt: -0.4,
          skullEyeAsym: 0,
          skullNoseWidth: 0.04,
          skullNoseHeight: 0.06,
          skullNoseY: 0.58,
          skullNoseShape: 'slit',
          skullTeethCount: 0,
          skullTeethLen: 0.06,
          skullTeethGap: 0.3,
          skullTeethShape: 'rect',
          skullMouthY: 0.86,
        })}
      </div>
      {group(t('skull.group.cranium'))}
      {row(t('opt.skullCraniumWidth'), 'skullCraniumWidth', 0.6, 1.25)}
      {row(t('opt.skullCraniumHeight'), 'skullCraniumHeight', 0.45, 0.75)}
      {chips(
        t('opt.skullCrown'),
        opts.skullCrown,
        [
          ['round', 'skull.crown.round'],
          ['flat', 'skull.crown.flat'],
        ],
        (v) => patch({ skullCrown: v as 'round' | 'flat' }),
      )}
      {row(t('opt.skullBrowRidge'), 'skullBrowRidge', 0, 0.12)}
      {row(t('opt.skullCheekWidth'), 'skullCheekWidth', 0.6, 1.1)}
      {group(t('skull.group.eyes'))}
      {row(t('opt.skullEyeSize'), 'skullEyeSize', 0.06, 0.26)}
      {row(t('opt.skullEyeSpacing'), 'skullEyeSpacing', 0.12, 0.4)}
      {row(t('opt.skullEyeY'), 'skullEyeY', 0.38, 0.6)}
      {chips(
        t('opt.skullEyeShape'),
        opts.skullEyeShape,
        [
          ['round', 'skull.eye.round'],
          ['oval', 'skull.eye.oval'],
          ['square', 'skull.eye.square'],
          ['angled', 'skull.eye.angled'],
        ],
        (v) => patch({ skullEyeShape: v as 'round' | 'oval' | 'square' | 'angled' }),
      )}
      {row(t('opt.skullEyeTilt'), 'skullEyeTilt', -1, 1)}
      {row(t('opt.skullEyeAsym'), 'skullEyeAsym', 0, 1)}
      {group(t('skull.group.nose'))}
      {row(t('opt.skullNoseWidth'), 'skullNoseWidth', 0.04, 0.16)}
      {row(t('opt.skullNoseHeight'), 'skullNoseHeight', 0.05, 0.2)}
      {row(t('opt.skullNoseY'), 'skullNoseY', 0.52, 0.75)}
      {chips(
        t('opt.skullNoseShape'),
        opts.skullNoseShape,
        [
          ['triangle', 'skull.nose.triangle'],
          ['heart', 'skull.nose.heart'],
          ['teardrop', 'skull.nose.teardrop'],
          ['slit', 'skull.nose.slit'],
        ],
        (v) => patch({ skullNoseShape: v as 'triangle' | 'heart' | 'teardrop' | 'slit' }),
      )}
      {group(t('skull.group.jaw'))}
      {row(t('opt.skullJawWidth'), 'skullJawWidth', 0.35, 0.95)}
      {row(t('opt.skullJawHeight'), 'skullJawHeight', 0.1, 0.3)}
      <CheckRow
        label={t('opt.skullMandible')}
        checked={opts.skullMandible}
        onChange={(v) => patch({ skullMandible: v })}
      />
      {row(t('opt.skullMouthY'), 'skullMouthY', 0.68, 0.9)}
      {row(t('opt.skullTeethCount'), 'skullTeethCount', 0, 14, 1)}
      {row(t('opt.skullTeethLen'), 'skullTeethLen', 0.04, 0.14)}
      {row(t('opt.skullTeethGap'), 'skullTeethGap', 0, 1)}
      {chips(
        t('opt.skullTeethShape'),
        opts.skullTeethShape,
        [
          ['rect', 'skull.teeth.rect'],
          ['rounded', 'skull.teeth.rounded'],
          ['pointed', 'skull.teeth.pointed'],
          ['fangs', 'skull.teeth.fangs'],
        ],
        (v) => patch({ skullTeethShape: v as 'rect' | 'rounded' | 'pointed' | 'fangs' }),
      )}
    </>
  )
}
