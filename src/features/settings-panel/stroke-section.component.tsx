import type { Doc } from '../../engine/core/doc.ts'
import {
  STROKE_COLOR_MODES,
  type StrokeColorMode,
  type StrokeSettings,
} from '../../engine/core/stroke.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { CheckRow, Chip, Slider } from '../../shared/ui/index.tsx'

/**
 * Outline group of the pixels-mode style block: hollow-cell strokes (width, derived color, fill
 * toggle). Width 0 keeps the classic filled rendering.
 */
export function StrokeSection({
  style,
  onApply,
}: {
  style: Doc['style']
  onApply: (patch: Partial<Doc['style']>) => void
}) {
  const { t } = useI18n()
  const st = style.stroke
  const patch: (p: Partial<StrokeSettings>) => void = (p) => onApply({ stroke: { ...st, ...p } })
  const pct = (v: number) => `${Math.round(v * 100)}%`
  return (
    <div className="flex flex-col gap-2">
      <div className="text-muted text-overline font-semibold tracking-wider uppercase">
        {t('style.stroke.title')}
      </div>
      <Slider
        label={t('style.stroke.width')}
        title={t('style.stroke.width.desc')}
        value={st.width}
        min={0}
        max={0.45}
        step={0.01}
        display={pct}
        onChange={(v) => patch({ width: v })}
      />
      {st.width > 0 && (
        <>
          <span className="text-muted text-xs">{t('style.stroke.colorMode')}</span>
          <div className="grid grid-cols-3 gap-1.5">
            {STROKE_COLOR_MODES.map((mode: StrokeColorMode) => (
              <Chip
                key={mode}
                active={st.colorMode === mode}
                title={t(`style.stroke.colorMode.${mode}` as 'style.stroke.colorMode.same')}
                onClick={() => patch({ colorMode: mode })}
              >
                {t(`style.stroke.colorMode.${mode}` as 'style.stroke.colorMode.same')}
              </Chip>
            ))}
          </div>
          {(st.colorMode === 'darken' || st.colorMode === 'lighten') && (
            <Slider
              label={t('style.stroke.depth')}
              title={t('style.stroke.depth.desc')}
              value={st.depth}
              min={0}
              max={1}
              step={0.01}
              display={pct}
              onChange={(v) => patch({ depth: v })}
            />
          )}
          <CheckRow
            label={t('style.stroke.fill')}
            title={t('style.stroke.fill.desc')}
            checked={st.fill}
            onChange={(v) => patch({ fill: v })}
          />
        </>
      )}
    </div>
  )
}
