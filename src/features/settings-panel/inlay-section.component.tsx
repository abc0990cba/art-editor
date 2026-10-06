import { paramsOf, type CellShapeId } from '../../engine/cell-shapes/index.ts'
import { hexLuminance } from '../../engine/color/color.ts'
import type { Doc } from '../../engine/core/doc.ts'
import { INLAY_COLOR_MODES, type InlaySettings } from '../../engine/core/inlay.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { CheckRow, Chip, Slider, TextField } from '../../shared/ui/index.tsx'
import { ShapeTileGrid } from '../../shared/ui/shape-tiles.component.tsx'

const COLOR_MODE_KEYS = {
  slot: 'style.inlay.colorMode.slot',
  darken: 'style.inlay.colorMode.darken',
  lighten: 'style.inlay.colorMode.lighten',
  toneDark: 'style.inlay.colorMode.toneDark',
  toneLight: 'style.inlay.colorMode.toneLight',
} as const satisfies Record<(typeof INLAY_COLOR_MODES)[number], string>

type InlayPatch = (patch: Partial<InlaySettings>) => void

/** Color source of the inner figure: mode chips, palette-slot swatches, darken/lighten strength. */
function InlayColorPicker({
  inlay,
  palette,
  onPatch,
}: {
  inlay: InlaySettings
  palette: readonly string[]
  onPatch: InlayPatch
}) {
  const { t } = useI18n()
  return (
    <>
      <span className="text-muted text-xs">{t('style.inlay.colorMode')}</span>
      <div className="grid grid-cols-3 gap-1.5">
        {INLAY_COLOR_MODES.map((mode) => (
          <Chip
            key={mode}
            active={inlay.colorMode === mode}
            title={t(COLOR_MODE_KEYS[mode] as 'style.inlay.colorMode.slot')}
            onClick={() => onPatch({ colorMode: mode })}
          >
            {t(COLOR_MODE_KEYS[mode] as 'style.inlay.colorMode.slot')}
          </Chip>
        ))}
      </div>
      {inlay.colorMode === 'slot' && (
        <div className="flex flex-wrap gap-1.5">
          {palette.map((c, i) => (
            <button
              key={`${c}-${i}`}
              type="button"
              title={c}
              aria-label={t('style.inlay.slot')}
              aria-pressed={inlay.slot === i + 1}
              onClick={() => onPatch({ slot: i + 1 })}
              className={`border-line h-7 w-7 rounded-md border transition max-lg:h-11 max-lg:w-11 ${
                inlay.slot === i + 1
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
      )}
      {(inlay.colorMode === 'darken' || inlay.colorMode === 'lighten') && (
        <Slider
          label={t('style.inlay.depth')}
          title={t('style.inlay.depth.desc')}
          value={inlay.depth}
          min={0}
          max={1}
          step={0.01}
          display={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => onPatch({ depth: v })}
        />
      )}
    </>
  )
}

/** Content source of the inner figure: registered form or sampled character. */
function SourceChips({ glyph, onPatch }: { glyph: boolean; onPatch: InlayPatch }) {
  const { t } = useI18n()
  return (
    <div className="grid grid-cols-2 gap-1.5">
      <Chip
        active={!glyph}
        title={t('style.inlay.source.shape.desc')}
        onClick={() => onPatch({ source: 'shape' })}
      >
        {t('style.inlay.source.shape')}
      </Chip>
      <Chip
        active={glyph}
        title={t('style.inlay.source.glyph.desc')}
        onClick={() => onPatch({ source: 'glyph' })}
      >
        {t('style.inlay.source.glyph')}
      </Chip>
    </div>
  )
}

/** Character field, dot-matrix resolution, dot silhouette and fill (glyph mode only). */
function GlyphControls({ inlay, onPatch }: { inlay: InlaySettings; onPatch: InlayPatch }) {
  const { t } = useI18n()
  return (
    <>
      <TextField
        value={inlay.glyph}
        placeholder={t('style.inlay.glyph')}
        ariaLabel={t('style.inlay.glyph')}
        onChange={(v) => onPatch({ glyph: v })}
      />
      <Slider
        label={t('style.inlay.resolution')}
        title={t('style.inlay.resolution.desc')}
        value={inlay.resolution}
        min={4}
        max={12}
        step={1}
        int
        display={(v) => `${Math.round(v)}×${Math.round(v)}`}
        onChange={(v) => onPatch({ resolution: v })}
      />
      <div className="grid grid-cols-2 gap-1.5">
        <Chip
          active={inlay.dotShape === 'square'}
          title={t('style.inlay.dotShape.square')}
          onClick={() => onPatch({ dotShape: 'square' })}
        >
          {t('style.inlay.dotShape.square')}
        </Chip>
        <Chip
          active={inlay.dotShape === 'circle'}
          title={t('style.inlay.dotShape.circle')}
          onClick={() => onPatch({ dotShape: 'circle' })}
        >
          {t('style.inlay.dotShape.circle')}
        </Chip>
      </div>
      <Slider
        label={t('style.inlay.dotScale')}
        title={t('style.inlay.dotScale.desc')}
        value={inlay.dotScale}
        min={0.4}
        max={1}
        step={0.01}
        display={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => onPatch({ dotScale: v })}
      />
    </>
  )
}

/** Sliders of the chosen inner form + the color picker (the enable toggle already passed). */
function InlayBody({
  shape,
  inlay,
  palette,
  onPatch,
}: {
  shape: CellShapeId
  inlay: InlaySettings
  palette: readonly string[]
  onPatch: InlayPatch
}) {
  const { t } = useI18n()
  const params = paramsOf(shape)
  const glyph = inlay.source === 'glyph'
  const pct = (v: number) => `${Math.round(v * 100)}%`
  const deg = (v: number) => `${Math.round(v)}°`
  return (
    <>
      <SourceChips glyph={glyph} onPatch={onPatch} />
      {glyph ? (
        <GlyphControls inlay={inlay} onPatch={onPatch} />
      ) : (
        <ShapeTileGrid
          shape={shape}
          onPick={(id) => onPatch({ shape: id })}
          ariaLabel={t('style.inlay.shape')}
        />
      )}
      <Slider
        label={t('style.inlay.scale')}
        title={t('style.inlay.scale.desc')}
        value={inlay.scale}
        min={0.1}
        max={0.9}
        step={0.01}
        display={pct}
        onChange={(v) => onPatch({ scale: v })}
      />
      <Slider
        label={t('style.inlay.offsetX')}
        title={t('style.inlay.offsetX.desc')}
        value={inlay.offsetX}
        min={-0.5}
        max={0.5}
        step={0.01}
        display={pct}
        onChange={(v) => onPatch({ offsetX: v })}
      />
      <Slider
        label={t('style.inlay.offsetY')}
        title={t('style.inlay.offsetY.desc')}
        value={inlay.offsetY}
        min={-0.5}
        max={0.5}
        step={0.01}
        display={pct}
        onChange={(v) => onPatch({ offsetY: v })}
      />
      {!glyph && params.includes('rotation') && (
        <Slider
          label={t('style.shape.rotation')}
          title={t('style.inlay.rotation.desc')}
          value={inlay.rotation}
          min={0}
          max={359}
          step={1}
          int
          display={deg}
          onChange={(v) => onPatch({ rotation: v })}
        />
      )}
      {!glyph && params.includes('thickness') && (
        <Slider
          label={t('style.shape.thickness')}
          title={t('style.inlay.thickness.desc')}
          value={inlay.thickness}
          min={0.05}
          max={0.5}
          step={0.01}
          display={pct}
          onChange={(v) => onPatch({ thickness: v })}
        />
      )}
      {!glyph && params.includes('points') && (
        <Slider
          label={t('style.shape.points')}
          title={t('style.inlay.points.desc')}
          value={inlay.points}
          min={3}
          max={12}
          step={1}
          int
          display={(v) => String(v)}
          onChange={(v) => onPatch({ points: v })}
        />
      )}
      <InlayColorPicker inlay={inlay} palette={palette} onPatch={onPatch} />
    </>
  )
}

/**
 * Inner-figure group of the pixels-mode style block: an optional second figure inside every cell.
 * Follows the ShapePicker pattern (form grid + per-form sliders) plus color-source controls.
 */
export function InlaySection({
  style,
  palette,
  onApply,
}: {
  style: Doc['style']
  palette: readonly string[]
  onApply: (patch: Partial<Doc['style']>) => void
}) {
  const { t } = useI18n()
  const inlay = style.inlay
  const patchInlay: InlayPatch = (patch) => onApply({ inlay: { ...inlay, ...patch } })
  return (
    <div className="flex flex-col gap-2">
      <div className="text-muted text-overline font-semibold tracking-wider uppercase">
        {t('style.inlay.title')}
      </div>
      <CheckRow
        label={t('style.inlay.enable')}
        title={t('style.inlay.enable.desc')}
        checked={inlay.shape !== 'none'}
        onChange={(v) => patchInlay({ shape: v ? 'circle' : 'none' })}
      />
      {inlay.shape !== 'none' && (
        <InlayBody shape={inlay.shape} inlay={inlay} palette={palette} onPatch={patchInlay} />
      )}
    </div>
  )
}
