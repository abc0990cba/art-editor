import { isPlainSquare } from '../../engine/grids/index.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { CheckRow, Chip, ColorInput, Section, Slider } from '../../shared/ui/index.tsx'
import { Tooltip } from '../../shared/ui/tooltip.component.tsx'
import { useStore } from '../../state/editor.store.ts'

/** Canvas section: radial scope, square fill rows/columns, sub-detail, connector width, bg, grid. */
export function CanvasSection() {
  const { t } = useI18n()
  const doc = useStore((s) => s.doc)
  const setRadialEven = useStore((s) => s.setRadialEven)
  const fillScope = useStore((s) => s.fillScope)
  const setFillScope = useStore((s) => s.setFillScope)
  const setSub = useStore((s) => s.setSub)
  const setConnectorWidth = useStore((s) => s.setConnectorWidth)
  const setBg = useStore((s) => s.setBg)
  const showGrid = useStore((s) => s.showGrid)
  const setShowGrid = useStore((s) => s.setShowGrid)
  const gridEmphasis = useStore((s) => s.gridEmphasis)
  const setGridEmphasis = useStore((s) => s.setGridEmphasis)
  const showDiffusionGuides = useStore((s) => s.showDiffusionGuides)
  const setShowDiffusionGuides = useStore((s) => s.setShowDiffusionGuides)
  const pct = (v: number) => `${Math.round(v * 100)}%`

  return (
    <Section title={t('panel.canvas')} icon="canvas">
      {doc.gridType === 'radial' && (
        <>
          <CheckRow
            label={t('grid.evenCells')}
            title={t('grid.evenCells.desc')}
            checked={doc.radialEven}
            onChange={(v) => setRadialEven(v)}
          />
          <div className="text-body flex items-center justify-between text-xs">
            <span>{t('fill.scope')}</span>
            <div className="flex gap-1">
              {(['cell', 'sector', 'ring'] as const).map((sc) => (
                <Chip
                  key={sc}
                  active={fillScope === sc}
                  title={t(`fill.scope.${sc}.desc` as 'fill.scope.cell.desc')}
                  onClick={() => setFillScope(sc)}
                >
                  {t(`fill.scope.${sc}` as 'fill.scope.cell')}
                </Chip>
              ))}
            </div>
          </div>
        </>
      )}
      {isPlainSquare(doc) && (
        <>
          <div className="text-body flex items-center justify-between text-xs">
            <span>{t('fill.scope')}</span>
            <div className="flex gap-1">
              {(['cell', 'row', 'column'] as const).map((sc) => (
                <Chip
                  key={sc}
                  active={fillScope === sc}
                  title={t(`fill.scope.${sc}.desc` as 'fill.scope.cell.desc')}
                  onClick={() => setFillScope(sc)}
                >
                  {t(`fill.scope.${sc}` as 'fill.scope.cell')}
                </Chip>
              ))}
            </div>
          </div>
          <div className="text-body flex items-center justify-between text-xs">
            <Tooltip label={t('grid.sub.desc')}>
              <span>{t('grid.sub')}</span>
            </Tooltip>
            <div className="flex gap-1">
              {([1, 2, 3] as const).map((sv) => (
                <Chip
                  key={sv}
                  active={doc.sub === sv}
                  title={t('grid.sub.desc')}
                  onClick={() => setSub(sv)}
                >
                  {sv}×
                </Chip>
              ))}
            </div>
          </div>
        </>
      )}
      <Slider
        label={t('canvas.connectorWidth')}
        title={t('canvas.connectorWidth.desc')}
        value={doc.connectorWidth}
        min={0.05}
        max={1}
        step={0.01}
        display={pct}
        onChange={setConnectorWidth}
      />
      <div className="text-body flex items-center justify-between text-xs">
        <Tooltip label={t('canvas.bg.desc')}>
          <span>{t('canvas.bg')}</span>
        </Tooltip>
        <div className="flex items-center gap-2">
          <CheckRow label="" checked={doc.bg === ''} onChange={(v) => setBg(v ? '' : '#1a1a1e')} />
          <ColorInput
            value={doc.bg || '#1a1a1e'}
            onChange={(v) => setBg(v)}
            title={t('canvas.bg')}
          />
        </div>
      </div>
      <CheckRow
        label={t('canvas.showGrid')}
        title={t('canvas.showGrid.desc')}
        checked={showGrid}
        onChange={setShowGrid}
      />
      {doc.renderMode === 'metaball' && (
        <CheckRow
          label={t('canvas.diffusion')}
          title={t('canvas.diffusion.desc')}
          checked={showDiffusionGuides}
          onChange={setShowDiffusionGuides}
        />
      )}
      <Slider
        label={t('grid.emphasis')}
        title={t('grid.emphasis.desc')}
        value={gridEmphasis}
        min={0}
        max={16}
        step={1}
        int
        display={(v) => (v < 2 ? t('grid.emphasis.off') : `${v}`)}
        onChange={setGridEmphasis}
      />
    </Section>
  )
}
