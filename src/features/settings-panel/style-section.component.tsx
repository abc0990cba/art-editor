import { isCurvedShape } from '../../engine/cell-shapes/index.ts'
import type { Doc } from '../../engine/core/doc.ts'
import { isPlainSquare } from '../../engine/grids/index.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { CheckRow, Chip, Section, Slider } from '../../shared/ui/index.tsx'
import { RoundingControls } from './rounding-controls.component.tsx'
import { ShapePicker } from './shape-picker.component.tsx'
import { ExtrudeKnobs, MetaballKnobs } from './style-mode-knobs.component.tsx'
import { PixelStylePreview } from './style-previews.component.tsx'

/** Selection-aware style target shared by the style/texture sections. */
export interface StyleTarget {
  styleView: Doc['style']
  modeView: Doc['renderMode']
  connView: Doc['connectivity']
  mbView: Doc['metaball']
  texView: Doc['texture']
  exView: Doc['extrude']
  elementMode: boolean
  targetSelection: boolean
  isSquare: boolean
  applyStyle: (patch: Partial<Doc['style']>) => void
  applyRenderMode: (mode: Doc['renderMode']) => void
  applyConnectivity: (c: Doc['connectivity']) => void
  applyMetaball: (patch: Partial<Doc['metaball']>) => void
  applyTexture: (patch: Partial<Doc['texture']>) => void
  applyExtrude: (patch: Partial<Doc['extrude']>) => void
  applyColor: (hex: string) => void
}

/** Drawing-style section: render mode, silhouette knobs, metaball settings. */
export function StyleSection({
  target,
  doc,
  selection,
  clearSelection,
  setStyleScope,
}: {
  target: StyleTarget
  doc: Doc
  selection: number[]
  clearSelection: () => void
  setStyleScope: (scope: 'global' | 'element') => void
}) {
  const { t } = useI18n()
  const {
    styleView,
    modeView,
    connView,
    mbView,
    exView,
    elementMode,
    targetSelection,
    applyStyle,
    applyRenderMode,
    applyConnectivity,
    applyMetaball,
    applyExtrude,
  } = target
  const isSquare = target.isSquare
  const curved = isCurvedShape(styleView.shape)
  const pct = (v: number) => `${Math.round(v * 100)}%`

  return (
    <Section title={t('panel.style')} icon="style">
      <PixelStylePreview
        style={styleView}
        renderMode={modeView}
        connectivity={connView}
        metaball={mbView}
      />
      <div className="text-body flex items-center justify-between text-xs">
        <span title={t('style.scope.element.desc')}>{t('style.scope')}</span>
        <div className="flex gap-1">
          <Chip
            active={elementMode}
            title={t('style.scope.element.desc')}
            onClick={() => setStyleScope('element')}
          >
            {t('style.scope.element')}
          </Chip>
          <Chip
            active={!elementMode}
            title={t('style.scope.global.desc')}
            onClick={() => setStyleScope('global')}
          >
            {t('style.scope.global')}
          </Chip>
        </div>
      </div>
      {!elementMode && <p className="text-muted text-overline">{t('style.scope.global.hint')}</p>}
      {targetSelection && (
        <div className="border-accent-line bg-accent-soft text-accent-text flex items-center justify-between rounded-md border px-2 py-1 text-xs">
          <span>
            {t('style.target.selection')} · {selection.length}
          </span>
          <button
            type="button"
            onClick={clearSelection}
            className="hover:bg-chip-active rounded px-1.5 py-0.5 transition"
          >
            {t('selection.clear')}
          </button>
        </div>
      )}
      <div className="text-muted text-overline font-semibold tracking-wider uppercase">
        {t('style.group.mode')}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {(
          [
            ['pixels', 'mode.pixels'],
            ['outline', 'mode.outline'],
            ['metaball', 'mode.metaball'],
            ['contour', 'mode.contour'],
            ['extrude', 'mode.extrude'],
          ] as const
        ).map(([mode, key]) => (
          <Chip
            key={mode}
            active={modeView === mode}
            title={t(`mode.${mode}.desc` as 'mode.pixels.desc')}
            onClick={() => applyRenderMode(mode)}
          >
            {t(key)}
          </Chip>
        ))}
      </div>
      {modeView !== 'pixels' && isPlainSquare(doc) && (
        <div className="flex flex-col gap-1">
          <span className="text-muted text-xs">{t('connectivity.label')}</span>
          <div className="flex gap-1.5">
            {(
              [
                ['edge', 'connectivity.edge'],
                ['corner', 'connectivity.corner'],
                ['corner-bridge', 'connectivity.bridge'],
              ] as const
            ).map(([c, key]) => (
              <Chip
                key={c}
                active={connView === c}
                title={t(`connectivity.${c}.desc` as 'connectivity.edge.desc')}
                onClick={() => applyConnectivity(c)}
              >
                {t(key)}
              </Chip>
            ))}
          </div>
        </div>
      )}
      {modeView === 'outline' && (
        <>
          <Slider
            label={t('style.convex')}
            title={t('style.convex.desc')}
            value={styleView.convexRadius}
            min={0}
            max={0.5}
            step={0.01}
            display={pct}
            onChange={(v) => applyStyle({ convexRadius: v })}
          />
          <Slider
            label={t('style.concave')}
            title={t('style.concave.desc')}
            value={styleView.concaveRadius}
            min={0}
            max={0.5}
            step={0.01}
            display={pct}
            onChange={(v) => applyStyle({ concaveRadius: v })}
          />
        </>
      )}
      {modeView === 'pixels' && (
        <>
          <div className="text-muted text-overline font-semibold tracking-wider uppercase">
            {t('style.group.shape')}
          </div>
          <ShapePicker style={styleView} onApply={applyStyle} />
          <CheckRow
            label={t('style.toneSize')}
            title={t('style.toneSize.desc')}
            checked={styleView.toneSize}
            onChange={(v) => applyStyle({ toneSize: v })}
          />
          {styleView.toneSize && (
            <Slider
              label={t('style.toneSizeMin')}
              title={t('style.toneSizeMin.desc')}
              value={styleView.toneSizeMin}
              min={0.05}
              max={1}
              step={0.01}
              display={pct}
              onChange={(v) => applyStyle({ toneSizeMin: v })}
            />
          )}
          <div className="text-muted text-overline font-semibold tracking-wider uppercase">
            {t('style.group.size')}
          </div>
          <Slider
            label={t('style.sizeX')}
            title={t('style.sizeX.desc')}
            value={styleView.sizeX}
            min={0.05}
            max={1}
            step={0.01}
            display={pct}
            onChange={(v) => applyStyle({ sizeX: v })}
          />
          <Slider
            label={t('style.sizeY')}
            title={t('style.sizeY.desc')}
            value={styleView.sizeY}
            min={0.05}
            max={1}
            step={0.01}
            display={pct}
            onChange={(v) => applyStyle({ sizeY: v })}
          />
          <Slider
            label={t('style.sizeJitter')}
            title={t('style.sizeJitter.desc')}
            value={styleView.sizeJitter}
            min={0}
            max={1}
            step={0.01}
            display={pct}
            onChange={(v) => applyStyle({ sizeJitter: v })}
          />
          <Slider
            label={t('style.angleJitter')}
            title={t('style.angleJitter.desc')}
            value={styleView.angleJitter}
            min={0}
            max={180}
            step={1}
            int
            display={(v) => `${Math.round(v)}°`}
            onChange={(v) => applyStyle({ angleJitter: v })}
          />
          <div className="text-body flex items-center justify-between text-xs">
            <span title={t('style.jitterSeed.desc')}>{t('style.jitterSeed')}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-muted tabular-nums">{styleView.jitterSeed}</span>
              <Chip
                title={t('style.jitterSeed.randomize.desc')}
                onClick={() => applyStyle({ jitterSeed: 1 + Math.floor(Math.random() * 9999) })}
              >
                {t('style.jitterSeed.randomize')}
              </Chip>
            </div>
          </div>
          {!curved && (
            <RoundingControls
              style={styleView}
              isSquareGrid={isPlainSquare(doc)}
              onApply={applyStyle}
            />
          )}
        </>
      )}
      {(modeView === 'metaball' || modeView === 'contour') && (
        <MetaballKnobs
          mb={mbView}
          isSquare={isSquare}
          contour={modeView === 'contour'}
          onPatch={applyMetaball}
        />
      )}
      {modeView === 'extrude' && (
        <ExtrudeKnobs ex={exView} palette={doc.palette} onPatch={applyExtrude} />
      )}
    </Section>
  )
}
