import type { Doc } from '../../engine/doc.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { CheckRow, Chip, Section, Slider } from '../../shared/ui/index.tsx'
import { PixelStylePreview } from './style-previews.component.tsx'

/** Selection-aware style target shared by the style/texture sections. */
export interface StyleTarget {
  styleView: Doc['style']
  modeView: Doc['renderMode']
  connView: Doc['connectivity']
  mbView: Doc['metaball']
  texView: Doc['texture']
  elementMode: boolean
  targetSelection: boolean
  isSquare: boolean
  applyStyle: (patch: Partial<Doc['style']>) => void
  applyRenderMode: (mode: Doc['renderMode']) => void
  applyConnectivity: (c: Doc['connectivity']) => void
  applyMetaball: (patch: Partial<Doc['metaball']>) => void
  applyTexture: (patch: Partial<Doc['texture']>) => void
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
    elementMode,
    targetSelection,
    applyStyle,
    applyRenderMode,
    applyConnectivity,
    applyMetaball,
  } = target
  const isSquare = target.isSquare
  const c = styleView.corners
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
      <div className="flex gap-1.5">
        {(
          [
            ['pixels', 'mode.pixels'],
            ['outline', 'mode.outline'],
            ['metaball', 'mode.metaball'],
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
      {modeView !== 'pixels' && doc.gridType === 'square' && (
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
      {modeView !== 'metaball' && (
        <>
          {modeView === 'outline' ? (
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
          ) : (
            <Slider
              label={t('style.radius')}
              title={t('style.radius.desc')}
              value={styleView.radius}
              min={0}
              max={0.5}
              step={0.01}
              display={pct}
              onChange={(v) => applyStyle({ radius: v })}
            />
          )}
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
                  active={styleView.cornerStyle === cs}
                  title={t(`style.corner.${cs}.desc` as 'style.corner.arc.desc')}
                  onClick={() => applyStyle({ cornerStyle: cs })}
                >
                  {t(key)}
                </Chip>
              ))}
            </div>
          </div>
          {isSquare && (
            <CheckRow
              label={t('style.squareEdges')}
              title={t('style.squareEdges.desc')}
              checked={styleView.squareEdges}
              onChange={(v) => applyStyle({ squareEdges: v })}
            />
          )}
        </>
      )}
      {modeView === 'pixels' && (
        <>
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
          <div className="text-muted text-overline font-semibold tracking-wider uppercase">
            {t('style.group.rounding')}
          </div>
          <div className="flex gap-1.5">
            <Chip
              active={styleView.radius === 0 && c.tl === null}
              title={t('style.square.desc')}
              onClick={() =>
                applyStyle({ radius: 0, corners: { tl: null, tr: null, br: null, bl: null } })
              }
            >
              {t('style.square')}
            </Chip>
            <Chip
              active={styleView.radius > 0 && styleView.radius < 0.5 && c.tl === null}
              title={t('style.rounded.desc')}
              onClick={() =>
                applyStyle({
                  radius: 0.42,
                  corners: { tl: null, tr: null, br: null, bl: null },
                })
              }
            >
              {t('style.rounded')}
            </Chip>
            <Chip
              active={styleView.radius === 0.5 && c.tl === null}
              title={t('style.circle.desc')}
              onClick={() =>
                applyStyle({ radius: 0.5, corners: { tl: null, tr: null, br: null, bl: null } })
              }
            >
              {t('style.circle')}
            </Chip>
          </div>
          {doc.gridType === 'square' && (
            <>
              <CheckRow
                label={t('style.perCorner')}
                title={t('style.perCorner.desc')}
                checked={c.tl !== null}
                onChange={(on) =>
                  applyStyle({
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
                    onChange={(v) => applyStyle({ corners: { ...c, tl: v } })}
                  />
                  <Slider
                    label="↗"
                    value={c.tr ?? 0}
                    min={0}
                    max={0.5}
                    step={0.01}
                    display={pct}
                    onChange={(v) => applyStyle({ corners: { ...c, tr: v } })}
                  />
                  <Slider
                    label="↘"
                    value={c.br ?? 0}
                    min={0}
                    max={0.5}
                    step={0.01}
                    display={pct}
                    onChange={(v) => applyStyle({ corners: { ...c, br: v } })}
                  />
                  <Slider
                    label="↙"
                    value={c.bl ?? 0}
                    min={0}
                    max={0.5}
                    step={0.01}
                    display={pct}
                    onChange={(v) => applyStyle({ corners: { ...c, bl: v } })}
                  />
                </div>
              )}
            </>
          )}
        </>
      )}
      {modeView === 'metaball' && (
        <>
          <div className="text-muted text-overline font-semibold tracking-wider uppercase">
            {t('style.group.metaball')}
          </div>
          <Slider
            label={t('metaball.strength')}
            title={t('metaball.strength.desc')}
            value={mbView.strength}
            min={0}
            max={100}
            onChange={(v) => applyMetaball({ strength: v })}
          />
          <CheckRow
            label={t('metaball.perColor')}
            title={t('metaball.perColor.desc')}
            checked={mbView.perColor}
            onChange={(v) => applyMetaball({ perColor: v })}
          />
          <div className="text-body flex items-center justify-between text-xs">
            <span>{t('metaball.quality')}</span>
            <div className="flex gap-1">
              {([2, 4, 6] as const).map((q, i) => (
                <Chip
                  key={q}
                  active={mbView.quality === q}
                  title={t('metaball.quality.desc')}
                  onClick={() => applyMetaball({ quality: q })}
                >
                  {
                    [
                      t('metaball.quality.low'),
                      t('metaball.quality.med'),
                      t('metaball.quality.high'),
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
              checked={mbView.squareEdges}
              onChange={(v) => applyMetaball({ squareEdges: v })}
            />
          )}
        </>
      )}
    </Section>
  )
}
