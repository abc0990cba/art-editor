import { useEffect, useState, type JSX } from 'react'
import { useStore, type Tool, type ToolOpts } from '../state/store'

/** ToolOpts keys that hold numbers — the sliders' writable keys. */
type NumericOptKey = {
  [K in keyof ToolOpts]: ToolOpts[K] extends number ? K : never
}[keyof ToolOpts]
import { SHAPE_TOOLS } from '../engine/shapes'
import { useI18n } from '../i18n'
import { Tooltip } from './Tooltip'
import { CheckRow, Chip, Slider } from './ui'
import { FillSettings } from './FillSettings'
import { ToolPreview } from './ToolPreview'
import { ExpandablePreview } from './PreviewExpander'
import { ShapePaintControls } from './ShapePaintControls'
import { FloatingPanel } from './FloatingPanel'
import { isShapeTool } from '../engine/shapes'

/** CSS width of the per-tool settings popover (w-80); anchors flip when this won't fit. */
const SETTINGS_W = 320

const icons: Record<Tool, JSX.Element> = {
  select: <path d="M5 2.2l7.6 6.6-3.5.5 2 3.8-1.8.9-2-3.8-2.3 2.6z" />,
  pencil: <path d="M11.5 2.5a1.7 1.7 0 012.4 2.4L6 12.8l-3.2.8.8-3.2 7.9-7.9z" />,
  eraser: (
    <>
      <path d="M9.5 3.5l3 3-5.5 5.5h-3l-1.5-1.5 7-7z" />
      <path d="M6 12h7.5" />
    </>
  ),
  fill: (
    <>
      <path d="M8.5 2l5 5-4.6 4.6a1.4 1.4 0 01-2 0L4 8.7a1.4 1.4 0 010-2L8.5 2z" />
      <path d="M13.5 10.5s1.3 1.7 1.3 2.6a1.3 1.3 0 11-2.6 0c0-.9 1.3-2.6 1.3-2.6z" />
    </>
  ),
  picker: (
    <>
      <path d="M13.5 2.5a1.8 1.8 0 00-2.5 0L9.6 3.9l2.5 2.5 1.4-1.4a1.8 1.8 0 000-2.5z" />
      <path d="M9 4.5L3.5 10v2.5H6L11.5 7" />
    </>
  ),
  line: <path d="M3 13L13 3" />,
  rect: <rect x="3" y="4.5" width="10" height="7" rx="0.5" />,
  ellipse: <circle cx="8" cy="8" r="5" />,
  connector: (
    <>
      <circle cx="3.5" cy="12.5" r="1.7" />
      <circle cx="12.5" cy="3.5" r="1.7" />
      <path d="M4.8 11.2l6.4-6.4" />
    </>
  ),
  star: (
    <path d="M8 1.5l1.65 4.23 4.53.26-3.52 2.88 1.16 4.39L8 10.8l-3.82 2.46 1.16-4.39-3.52-2.88 4.53-.26z" />
  ),
  polygon: <path d="M8 2l5.2 3v6L8 14l-5.2-3V5L8 2z" />,
  diamond: <path d="M8 2l6 6-6 6-6-6z" />,
  heart: (
    <path d="M8 13.5C4 10.5 2.5 8.4 2.5 6.4c0-1.8 1.4-3.2 3.1-3.2 1 0 1.9.5 2.4 1.3.5-.8 1.4-1.3 2.4-1.3 1.7 0 3.1 1.4 3.1 3.2 0 2-1.5 4.1-5.5 7.1z" />
  ),
  spiral: <path d="M8 8a1.2 1.2 0 012.4 0 2.6 2.6 0 01-5.2 0 4.2 4.2 0 018.4 0 6 6 0 01-12 0" />,
  arrow: <path d="M2 8h9.5M11.5 8L8 4.5M11.5 8L8 11.5" />,
  lightning: <path d="M9 1.5L4 9h3l-1 5.5L11 7H8l1-5.5z" />,
  moon: <path d="M8 2a4 4 0 006 6 6 6 0 11-6-6z" />,
  wave: <path d="M2 8c1.1-3.6 2.4-3.6 3.5 0s2.4 3.6 3.5 0 2.4-3.6 3.5 0" />,
  cross: <path d="M6 2h4v4h4v4h-4v4H6v-4H2V6h4z" />,
  flower: (
    <>
      <circle cx="8" cy="8" r="1.4" />
      <circle cx="8" cy="4.6" r="2.2" />
      <circle cx="11.4" cy="7.1" r="2.2" />
      <circle cx="10.1" cy="11" r="2.2" />
      <circle cx="5.9" cy="11" r="2.2" />
      <circle cx="4.6" cy="7.1" r="2.2" />
    </>
  ),
  gear: (
    <>
      <circle cx="8" cy="8" r="4.2" />
      <path d="M12.5 8h2M11.2 11.2l1.4 1.4M8 12.5v2M4.8 11.2l-1.4 1.4M3.5 8h-2M4.8 4.8L3.4 3.4M8 3.5v-2M11.2 4.8l1.4-1.4" />
    </>
  ),
  sun: (
    <>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v2.2M8 12.3v2.2M1.5 8h2.2M12.3 8h2.2M3.4 3.4L5 5M11 11l1.6 1.6M12.6 3.4L11 5M5 11l-1.6 1.6" />
    </>
  ),
  bento: (
    <>
      <rect x="2" y="2" width="5.5" height="7.5" rx="1" />
      <rect x="8.5" y="2" width="5.5" height="4" rx="1" />
      <rect x="8.5" y="7" width="5.5" height="7" rx="1" />
      <rect x="2" y="10.5" width="5.5" height="3.5" rx="1" />
    </>
  ),
  zigzag: <path d="M2 11.5l3.5-7 3.5 7 3.5-7 1.5 3" />,
  ring: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="2.2" />
    </>
  ),
  arc: <path d="M2.5 12.5a5.5 5.5 0 0111 0" />,
  drop: <path d="M8 2.2C10.2 5.2 12 7.3 12 9.4a4 4 0 11-8 0C4 7.3 5.8 5.2 8 2.2z" />,
  chevron: <path d="M2.5 12.5L8 4.5l5.5 8M5.4 12.5L8 8.8l2.6 3.7" />,
  concentric: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="3.2" />
      <circle cx="8" cy="8" r="1" />
    </>
  ),
  concentricRect: (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" rx="0.5" />
      <rect x="5.5" y="5.5" width="5" height="5" rx="0.5" />
    </>
  ),
  skull: (
    <>
      <path d="M3.5 7a4.5 4.5 0 019 0v2.2c0 .9-.5 1.5-1.2 1.9l-.3 2.4h-6l-.3-2.4C4 11.7 3.5 11.1 3.5 10.2z" />
      <circle cx="5.9" cy="7.6" r="1.15" />
      <circle cx="10.1" cy="7.6" r="1.15" />
      <path d="M8 9.3l-.7 1.6h1.4z" />
      <path d="M6.2 11.5v2M8 11.5v2M9.8 11.5v2" />
    </>
  ),
}

const toolKeys: Record<Tool, string> = {
  select: 'V',
  pencil: 'B',
  eraser: 'E',
  fill: 'G',
  picker: 'I',
  line: 'L',
  rect: 'R',
  ellipse: 'O',
  connector: 'C',
  star: 'S',
  polygon: 'N',
  diamond: 'D',
  heart: 'H',
  spiral: 'Q',
  arrow: 'A',
  lightning: 'K',
  moon: 'M',
  wave: 'W',
  cross: 'X',
  flower: 'J',
  gear: 'U',
  sun: '4',
  bento: '5',
  zigzag: 'Z',
  ring: 'T',
  arc: 'Y',
  drop: 'P',
  chevron: '1',
  concentric: '2',
  concentricRect: '3',
  skull: '6',
}

const order: Tool[] = [
  'select',
  'pencil',
  'eraser',
  'fill',
  'picker',
  'line',
  'rect',
  'ellipse',
  'connector',
]

/** The rail shows every tool in one flat list. */
const allOrder: Tool[] = [...order, ...SHAPE_TOOLS]

function ToolIcon({ id, className = 'h-4.5 w-4.5' }: { id: Tool; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {icons[id]}
    </svg>
  )
}

function Chevron({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  )
}

interface SettingsAnchor {
  tool: Tool
  x: number
  y: number
}

/** Floating per-tool settings panel, opened by double-clicking a rail button. */
function ToolSettings({ anchor, onClose }: { anchor: SettingsAnchor; onClose: () => void }) {
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
  const previewGrid = useStore((s) => s.previewGrid)
  const setPreviewGrid = useStore((s) => s.setPreviewGrid)
  // text mirrors of the grid inputs so typing stays responsive while values clamp
  const [gridText, setGridText] = useState<{ cols: string | null; rows: string | null }>({
    cols: null,
    rows: null,
  })

  const commitGrid = (axis: 'cols' | 'rows', raw: string) => {
    setGridText((prev) => ({ ...prev, [axis]: raw }))
    const n = Math.round(Number(raw))
    if (raw.trim() === '' || !Number.isFinite(n)) return
    // the preview can never exceed the current canvas, and stays at 4+ cells so a
    // shape still has a (cols-3)×(rows-3) box to rasterize into
    const max = axis === 'cols' ? doc.cols : doc.rows
    const clamped = Math.max(4, Math.min(max, n))
    setPreviewGrid({ ...(previewGrid ?? { cols: 37, rows: 24 }), [axis]: clamped })
  }
  const grid = previewGrid ?? { cols: 37, rows: 24 }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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

  const tool = anchor.tool
  // preview grid: the user override when set, otherwise the per-context defaults. The
  // large copy uses the same cells as the compact one when overridden, with the cell
  // size fitted to the floating panel so any grid up to the canvas size stays readable.
  const tipTool = tool === 'pencil' || tool === 'eraser'
  const fitCell = (cols: number, rows: number) =>
    Math.max(2, Math.min(48, Math.floor(704 / cols), Math.floor(560 / rows)))
  const largeGrid = previewGrid
    ? { cols: grid.cols, rows: grid.rows, cell: fitCell(grid.cols, grid.rows) }
    : tipTool
      ? { cols: 15, rows: 9, cell: 48 }
      : { cols: 72, rows: 44, cell: 10 }
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
    body = <p className="text-xs text-muted">{t('opt.none')}</p>
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
        <div className="flex items-center justify-between text-xs text-body">
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
        <div className="flex items-center justify-between text-xs text-body">
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
        <div className="flex items-center justify-between text-xs text-body">
          <span>{t('opt.bentoSeed')}</span>
          <Chip title={t('opt.bentoReroll.desc')} onClick={() => setOpt('bentoSeed', opts.bentoSeed + 1)}>
            {t('opt.bentoReroll')}
          </Chip>
        </div>
      </>
    )
  } else if (tool === 'skull') {
    // style presets patch several knobs at once; every knob stays editable after
    const preset = (label: string, p: Partial<ToolOpts>) => (
      <Chip key={label} onClick={() => patch(p)}>
        {label}
      </Chip>
    )
    const row = (label: string, k: NumericOptKey, min: number, max: number, step = 0.01) => (
      <Slider label={label} value={opts[k] as number} min={min} max={max} step={step} editable int={step >= 1} onChange={(v) => setOpt(k, v)} />
    )
    const chips = (label: string, cur: string, vals: Array<[string, string]>, pick: (v: string) => void) => (
      <div className="flex items-center justify-between gap-2 text-xs text-body">
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
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</div>
    )
    body = (
      <>
        <div className="flex flex-wrap gap-1">
          {preset(t('skull.preset.anatomic'), {
            skullCraniumWidth: 1, skullCraniumHeight: 0.6, skullCrown: 'round', skullBrowRidge: 0.03,
            skullCheekWidth: 0.92, skullJawWidth: 0.72, skullJawHeight: 0.22, skullMandible: true,
            skullEyeSize: 0.16, skullEyeSpacing: 0.26, skullEyeY: 0.48, skullEyeShape: 'round',
            skullEyeTilt: 0, skullEyeAsym: 0, skullNoseWidth: 0.09, skullNoseHeight: 0.11,
            skullNoseY: 0.63, skullNoseShape: 'triangle', skullTeethCount: 8, skullTeethLen: 0.08,
            skullTeethGap: 0.35, skullTeethShape: 'rect', skullMouthY: 0.82,
          })}
          {preset(t('skull.preset.cartoon'), {
            skullCraniumWidth: 1.15, skullCraniumHeight: 0.66, skullCrown: 'round', skullBrowRidge: 0,
            skullCheekWidth: 0.8, skullJawWidth: 0.55, skullJawHeight: 0.16, skullMandible: true,
            skullEyeSize: 0.24, skullEyeSpacing: 0.3, skullEyeY: 0.5, skullEyeShape: 'round',
            skullEyeTilt: 0, skullEyeAsym: 0, skullNoseWidth: 0.07, skullNoseHeight: 0.08,
            skullNoseY: 0.64, skullNoseShape: 'heart', skullTeethCount: 6, skullTeethLen: 0.06,
            skullTeethGap: 0.2, skullTeethShape: 'rounded', skullMouthY: 0.84,
          })}
          {preset(t('skull.preset.demon'), {
            skullCraniumWidth: 1, skullCraniumHeight: 0.58, skullCrown: 'flat', skullBrowRidge: 0.08,
            skullCheekWidth: 1.02, skullJawWidth: 0.6, skullJawHeight: 0.24, skullMandible: true,
            skullEyeSize: 0.14, skullEyeSpacing: 0.28, skullEyeY: 0.47, skullEyeShape: 'angled',
            skullEyeTilt: 0.9, skullEyeAsym: 0, skullNoseWidth: 0.05, skullNoseHeight: 0.16,
            skullNoseY: 0.62, skullNoseShape: 'slit', skullTeethCount: 10, skullTeethLen: 0.1,
            skullTeethGap: 0.6, skullTeethShape: 'fangs', skullMouthY: 0.8,
          })}
          {preset(t('skull.preset.alien'), {
            skullCraniumWidth: 1.2, skullCraniumHeight: 0.72, skullCrown: 'round', skullBrowRidge: 0,
            skullCheekWidth: 0.7, skullJawWidth: 0.42, skullJawHeight: 0.12, skullMandible: true,
            skullEyeSize: 0.24, skullEyeSpacing: 0.34, skullEyeY: 0.46, skullEyeShape: 'oval',
            skullEyeTilt: -0.4, skullEyeAsym: 0, skullNoseWidth: 0.04, skullNoseHeight: 0.06,
            skullNoseY: 0.58, skullNoseShape: 'slit', skullTeethCount: 0, skullTeethLen: 0.06,
            skullTeethGap: 0.3, skullTeethShape: 'rect', skullMouthY: 0.86,
          })}
        </div>
        {group(t('skull.group.cranium'))}
        {row(t('opt.skullCraniumWidth'), 'skullCraniumWidth', 0.6, 1.25)}
        {row(t('opt.skullCraniumHeight'), 'skullCraniumHeight', 0.45, 0.75)}
        {chips(t('opt.skullCrown'), opts.skullCrown, [['round', 'skull.crown.round'], ['flat', 'skull.crown.flat']], (v) => patch({ skullCrown: v as 'round' | 'flat' }))}
        {row(t('opt.skullBrowRidge'), 'skullBrowRidge', 0, 0.12)}
        {row(t('opt.skullCheekWidth'), 'skullCheekWidth', 0.6, 1.1)}
        {group(t('skull.group.eyes'))}
        {row(t('opt.skullEyeSize'), 'skullEyeSize', 0.06, 0.26)}
        {row(t('opt.skullEyeSpacing'), 'skullEyeSpacing', 0.12, 0.4)}
        {row(t('opt.skullEyeY'), 'skullEyeY', 0.38, 0.6)}
        {chips(t('opt.skullEyeShape'), opts.skullEyeShape, [['round', 'skull.eye.round'], ['oval', 'skull.eye.oval'], ['square', 'skull.eye.square'], ['angled', 'skull.eye.angled']], (v) => patch({ skullEyeShape: v as 'round' | 'oval' | 'square' | 'angled' }))}
        {row(t('opt.skullEyeTilt'), 'skullEyeTilt', -1, 1)}
        {row(t('opt.skullEyeAsym'), 'skullEyeAsym', 0, 1)}
        {group(t('skull.group.nose'))}
        {row(t('opt.skullNoseWidth'), 'skullNoseWidth', 0.04, 0.16)}
        {row(t('opt.skullNoseHeight'), 'skullNoseHeight', 0.05, 0.2)}
        {row(t('opt.skullNoseY'), 'skullNoseY', 0.52, 0.75)}
        {chips(t('opt.skullNoseShape'), opts.skullNoseShape, [['triangle', 'skull.nose.triangle'], ['heart', 'skull.nose.heart'], ['teardrop', 'skull.nose.teardrop'], ['slit', 'skull.nose.slit']], (v) => patch({ skullNoseShape: v as 'triangle' | 'heart' | 'teardrop' | 'slit' }))}
        {group(t('skull.group.jaw'))}
        {row(t('opt.skullJawWidth'), 'skullJawWidth', 0.35, 0.95)}
        {row(t('opt.skullJawHeight'), 'skullJawHeight', 0.1, 0.3)}
        <CheckRow label={t('opt.skullMandible')} checked={opts.skullMandible} onChange={(v) => patch({ skullMandible: v })} />
        {row(t('opt.skullMouthY'), 'skullMouthY', 0.68, 0.9)}
        {row(t('opt.skullTeethCount'), 'skullTeethCount', 0, 14, 1)}
        {row(t('opt.skullTeethLen'), 'skullTeethLen', 0.04, 0.14)}
        {row(t('opt.skullTeethGap'), 'skullTeethGap', 0, 1)}
        {chips(t('opt.skullTeethShape'), opts.skullTeethShape, [['rect', 'skull.teeth.rect'], ['rounded', 'skull.teeth.rounded'], ['pointed', 'skull.teeth.pointed'], ['fangs', 'skull.teeth.fangs']], (v) => patch({ skullTeethShape: v as 'rect' | 'rounded' | 'pointed' | 'fangs' }))}
      </>
    )
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

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      {/* FloatingPanel clamps the popover back on-screen after every size/anchor change,
          so settings of the bottom rail rows never open past the window edge */}
      <FloatingPanel
        x={anchor.x}
        y={anchor.y}
        className="fixed z-50 w-80 rounded-xl border border-line bg-panel p-3 shadow-xl"
      >
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted">
          {t('tool.settings')}
        </div>
        <div className="mb-2.5 flex items-center gap-1.5 text-body">
          <ToolIcon id={tool} className="h-4 w-4" />
          <span className="flex-1 text-xs font-medium">{t(`tool.${tool}`)}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('tool.settings')}
            className="text-muted transition hover:text-body"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
        {/* live preview of what the tool paints with the current settings; the fill tool
            already ships FillSettings' pattern preview, picker/select paint nothing */}
        <div className="flex max-h-[70vh] flex-col gap-2.5 overflow-y-auto">
          {tool !== 'fill' && tool !== 'picker' && tool !== 'select' && (
            <>
              <ExpandablePreview
                title={t(`tool.${tool}`)}
                panelWidth={largeGrid.cols * largeGrid.cell + 24}
                large={
                  <ToolPreview
                    tool={tool}
                    cols={largeGrid.cols}
                    rows={largeGrid.rows}
                    cell={largeGrid.cell}
                  />
                }
              >
                <ToolPreview
                  tool={tool}
                  cols={grid.cols}
                  rows={grid.rows}
                  cell={Math.max(1, Math.min(8, Math.floor(296 / grid.cols)))}
                />
              </ExpandablePreview>
              {/* editable sample-grid size, clamped to the current canvas dimensions */}
              <div className="flex items-center gap-1.5 text-xs text-body">
                <Tooltip label={t('preview.grid.desc')}>
                  <span className="text-muted">{t('preview.grid')}</span>
                </Tooltip>
                <input
                  type="number"
                  min={4}
                  max={doc.cols}
                  value={gridText.cols ?? grid.cols}
                  onChange={(e) => commitGrid('cols', e.target.value)}
                  onBlur={() => setGridText((prev) => ({ ...prev, cols: null }))}
                  title={`${t('preview.grid.desc')} (max ${doc.cols})`}
                  className="w-14 rounded-md border border-line bg-chip px-1.5 py-1 text-right text-xs text-body outline-none focus:border-accent-line"
                />
                <span className="text-muted">×</span>
                <input
                  type="number"
                  min={4}
                  max={doc.rows}
                  value={gridText.rows ?? grid.rows}
                  onChange={(e) => commitGrid('rows', e.target.value)}
                  onBlur={() => setGridText((prev) => ({ ...prev, rows: null }))}
                  title={`${t('preview.grid.desc')} (max ${doc.rows})`}
                  className="w-14 rounded-md border border-line bg-chip px-1.5 py-1 text-right text-xs text-body outline-none focus:border-accent-line"
                />
                {previewGrid && (
                  <Chip title={t('preview.gridReset.desc')} onClick={() => setPreviewGrid(null)}>
                    {t('preview.gridReset')}
                  </Chip>
                )}
              </div>
            </>
          )}
          {(tool === 'rect' || tool === 'ellipse' || tool === 'line' || isShapeTool(tool)) && (
            <ShapePaintControls fillable={tool !== 'line'} />
          )}
          {body}
        </div>
      </FloatingPanel>
    </>
  )
}

export function ToolRail() {
  const { t } = useI18n()
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const railOpen = useStore((s) => s.railOpen)
  const toggleRail = useStore((s) => s.toggleRail)
  const [settings, setSettings] = useState<SettingsAnchor | null>(null)

  /** open the per-tool settings next to the double-clicked row; FloatingPanel keeps
      the popover inside the viewport even for rows near the bottom edge */
  const openSettings = (id: Tool) => (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = r.right + 8 + SETTINGS_W > window.innerWidth ? Math.max(8, r.left - SETTINGS_W - 8) : r.right + 8
    setSettings({ tool: id, x, y: r.top })
  }

  const row = (id: Tool, expanded: boolean) => (
    <Tooltip
      key={id}
      label={`${t(`tool.${id}`)} (${toolKeys[id]}) — ${t(`tool.${id}.desc` as 'tool.pencil.desc')}`}
    >
      <button
        type="button"
        onClick={() => setTool(id)}
        onDoubleClick={openSettings(id)}
        className={
          expanded
            ? `flex h-8 w-full items-center gap-2 rounded-lg border px-2 transition ${
                tool === id
                  ? 'border-accent-line bg-accent-soft text-accent-text'
                  : 'border-transparent text-muted hover:bg-chip hover:text-body'
              }`
            : `flex h-9 w-9 items-center justify-center rounded-lg border transition ${
                tool === id
                  ? 'border-accent-line bg-accent-soft text-accent-text'
                  : 'border-transparent text-muted hover:bg-chip hover:text-body'
              }`
        }
      >
        <ToolIcon id={id} className={expanded ? 'h-4 w-4' : 'h-4.5 w-4.5'} />
        {expanded && (
          <>
            <span className="flex-1 truncate text-left text-xs">{t(`tool.${id}`)}</span>
            <span className="text-[10px] tabular-nums text-muted">{toolKeys[id]}</span>
          </>
        )}
      </button>
    </Tooltip>
  )

  if (railOpen) {
    return (
      <nav className="flex w-48 shrink-0 flex-col border-r border-line">
        <div className="rail-list flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-2 py-2">
          {allOrder.map((id) => row(id, true))}
        </div>
        <div className="border-t border-line p-2">
          <Tooltip label={t('panel.railCollapse')}>
            <button
              type="button"
              onClick={() => {
                setSettings(null)
                toggleRail()
              }}
              className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-muted transition hover:bg-chip hover:text-body"
            >
              <Chevron d="M9.5 4L5.5 8l4 4" />
              <span className="flex-1 truncate text-left text-xs">{t('panel.railCollapse')}</span>
            </button>
          </Tooltip>
        </div>
        {settings && <ToolSettings anchor={settings} onClose={() => setSettings(null)} />}
      </nav>
    )
  }

  return (
    <nav className="flex w-12 shrink-0 flex-col border-r border-line">
      <div className="rail-list flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto overflow-x-hidden py-2">
        {allOrder.map((id) => row(id, false))}
      </div>
      <div className="flex justify-center border-t border-line py-2">
        <Tooltip label={t('panel.railExpand')}>
          <button
            type="button"
            onClick={() => {
              setSettings(null)
              toggleRail()
            }}
            aria-label={t('panel.railExpand')}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition hover:bg-chip hover:text-body"
          >
            <Chevron d="M6.5 4l4 4-4 4" />
          </button>
        </Tooltip>
      </div>
      {settings && <ToolSettings anchor={settings} onClose={() => setSettings(null)} />}
    </nav>
  )
}
