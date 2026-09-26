import type { JSX } from 'react'

import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { Chip, Slider } from '../../shared/ui/index.tsx'
import { useStore, type Tool, type ToolOpts } from '../../state/editor.store.ts'
import type { NumericOptKey } from '../../state/tools.slice.ts'
import { FillSettings } from './fill-settings.component.tsx'
import { SkullSettings } from './tool-settings-skull.component.tsx'

/**
 * Per-tool settings controls for the floating panel: one branch per tool. The shell owns the
 * preview and positioning; this component only renders the tool's controls.
 */
export function ToolSettingsBody({ tool }: { tool: Tool }) {
  const { t } = useI18n()
  const opts = useStore((s) => s.toolOpts)
  const patch = useStore((s) => s.patchToolOpts)
  const brush = useStore((s) => s.brush)
  const patchBrush = useStore((s) => s.patchBrush)
  const radii = useStore((s) => s.concentricRadii)
  const setConcentricCount = useStore((s) => s.setConcentricCount)
  const setConcentricRadius = useStore((s) => s.setConcentricRadius)
  const connectorWidth = useStore((s) => s.doc.connectorWidth)
  const setConnectorWidth = useStore((s) => s.setConnectorWidth)
  const doc = useStore((s) => s.doc)

  const pct = (v: number) => `${Math.round(v * 100)}%`
  const deg = (v: number) => `${Math.round(v)}°`
  const setOpt = (k: NumericOptKey, v: number) => patch({ [k]: v } as Partial<ToolOpts>)
  const rotation = (k: NumericOptKey) => (
    <Slider
      label={t('opt.rotation')}
      title={t('opt.rotation.desc')}
      value={opts[k]}
      min={0}
      max={359}
      display={deg}
      onChange={(v) => setOpt(k, v)}
    />
  )
  const cornerSlider = () => (
    <Slider
      label={t('opt.shapeCorner')}
      title={t('opt.shapeCorner.desc')}
      value={opts.shapeCorner}
      min={0}
      max={0.5}
      step={0.01}
      display={pct}
      onChange={(v) => setOpt('shapeCorner', v)}
    />
  )
  const bulgeSlider = () => (
    <Slider
      label={t('opt.shapeBulge')}
      title={t('opt.shapeBulge.desc')}
      value={opts.shapeBulge}
      min={-1}
      max={1}
      step={0.05}
      display={(v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`}
      onChange={(v) => setOpt('shapeBulge', v)}
    />
  )
  // a brush wider than half the canvas is useless: cap the slider to the canvas,
  // typing may still reach the hard 16-cell limit
  const strokeMax = Math.max(4, Math.min(16, Math.floor(Math.min(doc.cols, doc.rows) / 2)))
  const strokeSlider = (
    <Slider
      label={t('opt.stroke')}
      title={t('opt.stroke.desc')}
      value={brush.size}
      min={1}
      max={strokeMax}
      int
      editable
      hardMin={1}
      hardMax={16}
      onChange={(v) => patchBrush({ size: v })}
    />
  )
  let body: JSX.Element
  if (tool === 'pencil' || tool === 'eraser' || tool === 'line') {
    body = strokeSlider
  } else if (tool === 'rect') {
    body = (
      <>
        {strokeSlider}
        {cornerSlider()}
        {bulgeSlider()}
      </>
    )
  } else if (tool === 'ellipse') {
    body = (
      <>
        {strokeSlider}
        <Slider
          label={t('opt.ellipsePower')}
          title={t('opt.ellipsePower.desc')}
          value={opts.ellipsePower}
          min={0.5}
          max={8}
          step={0.1}
          display={(v) => v.toFixed(1)}
          onChange={(v) => setOpt('ellipsePower', v)}
        />
      </>
    )
  } else if (tool === 'connector') {
    body = (
      <Slider
        label={t('canvas.connectorWidth')}
        title={t('canvas.connectorWidth.desc')}
        value={connectorWidth}
        min={0.05}
        max={1}
        step={0.01}
        display={pct}
        onChange={setConnectorWidth}
      />
    )
  } else if (tool === 'fill') {
    body = <FillSettings />
  } else if (tool === 'zigzag') {
    body = (
      <>
        <Slider
          label={t('opt.wavePeriods')}
          value={opts.wavePeriods}
          min={1}
          max={8}
          onChange={(v) => setOpt('wavePeriods', v)}
        />
        <Slider
          label={t('opt.waveAmplitude')}
          value={opts.waveAmplitude}
          min={0.02}
          max={0.45}
          step={0.01}
          onChange={(v) => setOpt('waveAmplitude', v)}
        />
      </>
    )
  } else if (tool === 'ring') {
    body = (
      <Slider
        label={t('opt.ringThickness')}
        title={t('opt.ringThickness.desc')}
        value={opts.ringThickness}
        min={0.1}
        max={0.45}
        step={0.01}
        display={pct}
        onChange={(v) => setOpt('ringThickness', v)}
      />
    )
  } else if (tool === 'arc') {
    body = rotation('starRotation')
  } else if (tool === 'drop') {
    body = rotation('polygonRotation')
  } else if (tool === 'chevron') {
    body = rotation('crossRotation')
  } else if (tool === 'concentric' || tool === 'concentricRect') {
    // loop count plus one radius slider per loop, generated from the store list
    body = (
      <>
        <Slider
          label={t('opt.concentricCount')}
          value={radii.length}
          min={1}
          max={8}
          onChange={(v) => setConcentricCount(v)}
        />
        {radii.map((r, i) => (
          <Slider
            key={i}
            label={`${t('opt.circleRadius')} ${i + 1}`}
            value={r}
            min={0.05}
            max={1}
            step={0.01}
            display={pct}
            onChange={(v) => setConcentricRadius(i, v)}
          />
        ))}
      </>
    )
  } else if (tool === 'picker' || tool === 'select') {
    body = <p className="text-muted text-xs">{t('opt.none')}</p>
  } else if (tool === 'star') {
    body = (
      <>
        <Slider
          label={t('opt.starRays')}
          value={opts.starRays}
          min={3}
          max={12}
          onChange={(v) => setOpt('starRays', v)}
        />
        <Slider
          label={t('opt.starInner')}
          title={t('opt.starInner.desc')}
          value={opts.starInner}
          min={0.15}
          max={0.49}
          step={0.01}
          display={pct}
          onChange={(v) => setOpt('starInner', v)}
        />
        {cornerSlider()}
        {rotation('starRotation')}
      </>
    )
  } else if (tool === 'polygon') {
    body = (
      <>
        <Slider
          label={t('opt.polygonSides')}
          value={opts.polygonSides}
          min={3}
          max={12}
          onChange={(v) => setOpt('polygonSides', v)}
        />
        {cornerSlider()}
        {rotation('polygonRotation')}
      </>
    )
  } else if (tool === 'diamond') {
    body = (
      <>
        {rotation('diamondRotation')}
        {cornerSlider()}
        {bulgeSlider()}
      </>
    )
  } else if (tool === 'heart') {
    body = rotation('heartRotation')
  } else if (tool === 'spiral') {
    body = (
      <>
        <Slider
          label={t('opt.spiralTurns')}
          value={opts.spiralTurns}
          min={0.5}
          max={6}
          step={0.25}
          onChange={(v) => setOpt('spiralTurns', v)}
        />
        <div className="text-body flex items-center justify-between text-xs">
          <span>{t('opt.spiralDir')}</span>
          <div className="flex gap-1">
            <Chip
              active={opts.spiralDir >= 0}
              title={t('opt.spiralDir.cw')}
              onClick={() => setOpt('spiralDir', 1)}
            >
              {t('opt.spiralDir.cw')}
            </Chip>
            <Chip
              active={opts.spiralDir < 0}
              title={t('opt.spiralDir.ccw')}
              onClick={() => setOpt('spiralDir', -1)}
            >
              {t('opt.spiralDir.ccw')}
            </Chip>
          </div>
        </div>
        {rotation('spiralRotation')}
      </>
    )
  } else if (tool === 'arrow') {
    body = (
      <>
        <Slider
          label={t('opt.arrowHead')}
          title={t('opt.arrowHead.desc')}
          value={opts.arrowHead}
          min={0.1}
          max={0.6}
          step={0.01}
          display={pct}
          onChange={(v) => setOpt('arrowHead', v)}
        />
        <Slider
          label={t('opt.arrowSpread')}
          title={t('opt.arrowSpread.desc')}
          value={opts.arrowSpread}
          min={0.2}
          max={1.2}
          step={0.05}
          display={pct}
          onChange={(v) => setOpt('arrowSpread', v)}
        />
      </>
    )
  } else if (tool === 'lightning') {
    body = rotation('lightningRotation')
  } else if (tool === 'moon') {
    body = (
      <>
        <Slider
          label={t('opt.moonThickness')}
          title={t('opt.moonThickness.desc')}
          value={opts.moonThickness}
          min={0.05}
          max={0.45}
          step={0.01}
          display={pct}
          onChange={(v) => setOpt('moonThickness', v)}
        />
        {rotation('moonRotation')}
      </>
    )
  } else if (tool === 'wave') {
    body = (
      <>
        <Slider
          label={t('opt.wavePeriods')}
          value={opts.wavePeriods}
          min={1}
          max={8}
          onChange={(v) => setOpt('wavePeriods', v)}
        />
        <Slider
          label={t('opt.waveAmplitude')}
          value={opts.waveAmplitude}
          min={0.02}
          max={0.45}
          step={0.01}
          display={pct}
          onChange={(v) => setOpt('waveAmplitude', v)}
        />
      </>
    )
  } else if (tool === 'cross') {
    body = (
      <>
        <Slider
          label={t('opt.crossThickness')}
          value={opts.crossThickness}
          min={0.15}
          max={0.45}
          step={0.01}
          display={pct}
          onChange={(v) => setOpt('crossThickness', v)}
        />
        {rotation('crossRotation')}
      </>
    )
  } else if (tool === 'flower') {
    body = (
      <>
        <Slider
          label={t('opt.flowerPetals')}
          value={opts.flowerPetals}
          min={3}
          max={12}
          onChange={(v) => setOpt('flowerPetals', v)}
        />
        {rotation('flowerRotation')}
      </>
    )
  } else if (tool === 'sun') {
    body = (
      <>
        <div className="text-body flex items-center justify-between text-xs">
          <span>{t('opt.sunRayShape')}</span>
          <div className="flex gap-1">
            <Chip
              active={opts.sunTaper > 0.75}
              title={t('opt.sunRayShape.rect.desc')}
              onClick={() => setOpt('sunTaper', 1)}
            >
              {t('opt.sunRayShape.rect')}
            </Chip>
            <Chip
              active={opts.sunTaper < 0.25}
              title={t('opt.sunRayShape.tri.desc')}
              onClick={() => setOpt('sunTaper', 0)}
            >
              {t('opt.sunRayShape.tri')}
            </Chip>
          </div>
        </div>
        <Slider
          label={t('opt.sunRays')}
          value={opts.sunRays}
          min={3}
          max={32}
          onChange={(v) => setOpt('sunRays', v)}
        />
        <Slider
          label={t('opt.sunCore')}
          title={t('opt.sunCore.desc')}
          value={opts.sunCore}
          min={0.02}
          max={0.45}
          step={0.01}
          display={pct}
          onChange={(v) => setOpt('sunCore', v)}
        />
        <Slider
          label={t('opt.sunRayBase')}
          title={t('opt.sunRayBase.desc')}
          value={opts.sunRayBase}
          min={0.02}
          max={0.49}
          step={0.01}
          display={pct}
          onChange={(v) => setOpt('sunRayBase', v)}
        />
        <Slider
          label={t('opt.sunRayLength')}
          value={opts.sunRayLength}
          min={0.3}
          max={1}
          step={0.01}
          display={pct}
          onChange={(v) => setOpt('sunRayLength', v)}
        />
        <Slider
          label={t('opt.sunAlternate')}
          title={t('opt.sunAlternate.desc')}
          value={opts.sunAlternate}
          min={0.05}
          max={1}
          step={0.01}
          display={pct}
          onChange={(v) => setOpt('sunAlternate', v)}
        />
        <Slider
          label={t('opt.sunTaper')}
          title={t('opt.sunTaper.desc')}
          value={opts.sunTaper}
          min={0}
          max={1}
          step={0.01}
          display={pct}
          onChange={(v) => setOpt('sunTaper', v)}
        />
        <Slider
          label={t('opt.sunWidth')}
          value={opts.sunWidth}
          min={0.1}
          max={1}
          step={0.01}
          display={pct}
          onChange={(v) => setOpt('sunWidth', v)}
        />
        <Slider
          label={t('opt.sunWave')}
          title={t('opt.sunWave.desc')}
          value={opts.sunWave}
          min={0}
          max={1}
          step={0.01}
          display={pct}
          onChange={(v) => setOpt('sunWave', v)}
        />
        <Slider
          label={t('opt.sunWavePeriods')}
          value={opts.sunWavePeriods}
          min={1}
          max={8}
          onChange={(v) => setOpt('sunWavePeriods', v)}
        />
        <Slider
          label={t('opt.sunTwist')}
          title={t('opt.sunTwist.desc')}
          value={opts.sunTwist}
          min={-1}
          max={1}
          step={0.05}
          display={(v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`}
          onChange={(v) => setOpt('sunTwist', v)}
        />
        {rotation('sunRotation')}
      </>
    )
  } else if (tool === 'bento') {
    body = (
      <>
        <Slider
          label={t('opt.bentoCols')}
          value={opts.bentoCols}
          min={1}
          max={8}
          onChange={(v) => setOpt('bentoCols', v)}
        />
        <Slider
          label={t('opt.bentoRows')}
          value={opts.bentoRows}
          min={1}
          max={8}
          onChange={(v) => setOpt('bentoRows', v)}
        />
        <Slider
          label={t('opt.bentoGap')}
          title={t('opt.bentoGap.desc')}
          value={opts.bentoGap}
          min={0}
          max={0.3}
          step={0.01}
          display={pct}
          onChange={(v) => setOpt('bentoGap', v)}
        />
        <Slider
          label={t('opt.bentoRadius')}
          value={opts.bentoRadius}
          min={0}
          max={0.5}
          step={0.01}
          display={pct}
          onChange={(v) => setOpt('bentoRadius', v)}
        />
        <Slider
          label={t('opt.bentoInset')}
          value={opts.bentoInset}
          min={0}
          max={0.2}
          step={0.01}
          display={pct}
          onChange={(v) => setOpt('bentoInset', v)}
        />
        <Slider
          label={t('opt.bentoChaos')}
          title={t('opt.bentoChaos.desc')}
          value={opts.bentoChaos}
          min={0}
          max={0.3}
          step={0.01}
          display={pct}
          onChange={(v) => setOpt('bentoChaos', v)}
        />
        <Slider
          label={t('opt.bentoMerge')}
          title={t('opt.bentoMerge.desc')}
          value={opts.bentoMerge}
          min={0}
          max={1}
          step={0.01}
          display={pct}
          onChange={(v) => setOpt('bentoMerge', v)}
        />
        <div className="text-body flex items-center justify-between text-xs">
          <span>{t('opt.bentoSeed')}</span>
          <Chip
            title={t('opt.bentoReroll.desc')}
            onClick={() => setOpt('bentoSeed', opts.bentoSeed + 1)}
          >
            {t('opt.bentoReroll')}
          </Chip>
        </div>
      </>
    )
  } else if (tool === 'skull') {
    body = <SkullSettings />
  } else {
    body = (
      <>
        <Slider
          label={t('opt.gearTeeth')}
          value={opts.gearTeeth}
          min={4}
          max={16}
          onChange={(v) => setOpt('gearTeeth', v)}
        />
        <Slider
          label={t('opt.gearDepth')}
          value={opts.gearDepth}
          min={0.05}
          max={0.3}
          step={0.01}
          display={pct}
          onChange={(v) => setOpt('gearDepth', v)}
        />
        {rotation('gearRotation')}
      </>
    )
  }

  return body
}
