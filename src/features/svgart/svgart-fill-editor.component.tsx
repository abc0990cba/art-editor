import type { ReactElement } from 'react'

import {
  hexColor,
  mustHex,
  paintCompat,
  paintToCss,
  rgbToHex,
  shapeBBox,
  type GradStop,
  type Paint,
  type RGB,
  type SvgLayer,
} from '../../engine/svgart/index.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { Chip, Section, Slider } from '../../shared/ui/index.tsx'
import { useStore } from '../../state/editor.store.ts'

/**
 * The selected layer's fill stack: solid/linear/radial paints painted bottom-to-top, each clipped
 * to the layer shape. Every effect here is AI-safe; the badge marks the radial focus (the one
 * "verify in your Illustrator" construct, see docs/research/ai-import.md).
 */
export function SvgArtFillEditor(): ReactElement | null {
  const { t } = useI18n()
  const scene = useStore((s) => s.svgartScene)
  const selection = useStore((s) => s.svgartSelection)
  const updateScene = useStore((s) => s.updateSvgArtScene)
  const select = useStore((s) => s.selectSvgArtLayer)
  const layer = scene.layers.find((l) => l.id === selection.layerId)
  if (!layer) return null

  const patchLayer = (next: SvgLayer): void => {
    updateScene((s) => ({ ...s, layers: s.layers.map((l) => (l.id === layer.id ? next : l)) }))
  }
  const patchFill = (index: number, paint: Paint): void => {
    const fills = layer.fills.slice()
    fills[index] = paint
    patchLayer({ ...layer, fills })
  }
  const addFill = (kind: 'solid' | 'linear' | 'radial'): void => {
    const bb = shapeBBox(layer.shape)
    const stops: GradStop[] = [
      { offset: 0, color: mustHex('#ffffff'), alpha: 1 },
      { offset: 1, color: mustHex('#5b4a8a'), alpha: 1 },
    ]
    const paint: Paint =
      kind === 'solid'
        ? { kind: 'solid', color: mustHex('#8a7ab5'), alpha: 0.6 }
        : kind === 'linear'
          ? {
              kind: 'linear',
              p1: { x: bb.x, y: bb.y },
              p2: { x: bb.x + bb.w, y: bb.y + bb.h },
              stops,
              alpha: 0.7,
            }
          : {
              kind: 'radial',
              units: 'bbox',
              cx: 0.5,
              cy: 0.5,
              r: 0.5,
              fx: null,
              fy: null,
              stops,
              alpha: 0.7,
            }
    patchLayer({ ...layer, fills: [...layer.fills, paint] })
    select(layer.id, layer.fills.length)
  }
  const removeFill = (index: number): void => {
    patchLayer({ ...layer, fills: layer.fills.filter((_, i) => i !== index) })
    select(layer.id, 0)
  }

  return (
    <Section title={t('svgart.fill.section')} icon="color" defaultOpen>
      <div className="flex flex-col gap-1.5">
        {layer.fills.map((paint, i) => (
          <FillRow
            key={i}
            paint={paint}
            layer={layer}
            active={selection.fillIndex === i}
            onSelect={() => select(layer.id, i)}
            onRemove={() => removeFill(i)}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        <Chip onClick={() => addFill('solid')}>+ {t('svgart.fill.solid')}</Chip>
        <Chip onClick={() => addFill('linear')}>+ {t('svgart.fill.linear')}</Chip>
        <Chip onClick={() => addFill('radial')}>+ {t('svgart.fill.radial')}</Chip>
      </div>
      {layer.fills[selection.fillIndex] && (
        <PaintEditor
          paint={layer.fills[selection.fillIndex] as Paint}
          onChange={(paint) => patchFill(selection.fillIndex, paint)}
        />
      )}
    </Section>
  )
}

function FillRow({
  paint,
  layer,
  active,
  onSelect,
  onRemove,
}: {
  paint: Paint
  layer: SvgLayer
  active: boolean
  onSelect: () => void
  onRemove: () => void
}): ReactElement {
  const { t } = useI18n()
  const compat = paintCompat(paint)
  const kindLabel =
    paint.kind === 'solid'
      ? t('svgart.fill.solid')
      : paint.kind === 'linear'
        ? t('svgart.fill.linear')
        : t('svgart.fill.radial')
  return (
    <div
      className={`border-line overflow-hidden rounded-md border transition ${active ? 'border-accent-line' : ''}`}
    >
      <div className="flex items-center gap-1 p-1">
        <button type="button" className="min-w-0 flex-1" onClick={onSelect}>
          <span
            className="border-line block h-6 w-full rounded border"
            style={{ background: paintToCss(paint, shapeBBox(layer.shape)) }}
          />
        </button>
        <span className="text-muted text-overline w-12 shrink-0 text-center">{kindLabel}</span>
        <span
          className="text-overline border-line shrink-0 rounded border px-1 py-px"
          title={t(compat.status === 'safe' ? 'svgart.ai.safe' : 'svgart.ai.verify')}
        >
          {compat.status === 'safe' ? 'AI ✓' : 'AI ?'}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="text-muted flex h-6 w-6 shrink-0 items-center justify-center rounded transition hover:text-red-400"
          aria-label={t('svgart.fill.delete')}
        >
          ✕
        </button>
      </div>
    </div>
  )
}

/** Editor of one paint: alpha, color (solid) or the stop list (gradients). */
function PaintEditor({
  paint,
  onChange,
}: {
  paint: Paint
  onChange: (p: Paint) => void
}): ReactElement {
  const { t } = useI18n()
  if (paint.kind === 'solid') {
    return (
      <div className="border-line flex flex-col gap-2 border-t pt-2">
        <ColorField
          label={t('svgart.fill.color')}
          color={paint.color}
          onChange={(color) => onChange({ ...paint, color })}
        />
        <AlphaSlider
          label={t('svgart.fill.alpha')}
          alpha={paint.alpha}
          onChange={(alpha) => onChange({ ...paint, alpha })}
        />
      </div>
    )
  }
  const setStops = (stops: GradStop[]): void => onChange({ ...paint, stops })
  return (
    <div className="border-line flex flex-col gap-2 border-t pt-2">
      {paint.kind === 'radial' && (
        <UnitsChips units={paint.units} onChange={(units) => onChange({ ...paint, units })} />
      )}
      {sortStopsForEdit(paint.stops).map((s, i) => (
        <StopRow
          key={i}
          stop={s}
          onChange={(next) => setStops(paint.stops.map((old) => (old === s ? next : old)))}
          onRemove={() => setStops(paint.stops.filter((old) => old !== s))}
          canRemove={paint.stops.length > 2}
        />
      ))}
      <Chip
        onClick={() =>
          setStops([...paint.stops, { offset: 1, color: midColor(paint.stops), alpha: 1 }])
        }
      >
        + {t('svgart.fill.stop.add')}
      </Chip>
      <AlphaSlider
        label={t('svgart.fill.alpha')}
        alpha={paint.alpha}
        onChange={(alpha) => onChange({ ...paint, alpha })}
      />
    </div>
  )
}

function UnitsChips({
  units,
  onChange,
}: {
  units: 'user' | 'bbox'
  onChange: (u: 'user' | 'bbox') => void
}): ReactElement {
  const { t } = useI18n()
  return (
    <div className="flex gap-1">
      <Chip
        active={units === 'bbox'}
        onClick={() => onChange('bbox')}
        title={t('svgart.fill.bbox.desc')}
      >
        {t('svgart.fill.bbox')}
      </Chip>
      <Chip
        active={units === 'user'}
        onClick={() => onChange('user')}
        title={t('svgart.fill.user.desc')}
      >
        {t('svgart.fill.user')}
      </Chip>
    </div>
  )
}

function StopRow({
  stop,
  onChange,
  onRemove,
  canRemove,
}: {
  stop: GradStop
  onChange: (s: GradStop) => void
  onRemove: () => void
  canRemove: boolean
}): ReactElement {
  const { t } = useI18n()
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="color"
        value={rgbToHex(stop.color)}
        onChange={(e) => onChange({ ...stop, color: hexColor(e.target.value) ?? stop.color })}
        className="border-line h-7 w-9 shrink-0 cursor-pointer rounded border bg-none p-0"
        aria-label={t('svgart.fill.color')}
      />
      <input
        type="number"
        min={0}
        max={1}
        step={0.01}
        value={stop.offset}
        onChange={(e) => onChange({ ...stop, offset: clamp01(Number(e.target.value)) })}
        className="border-line bg-chip text-body h-7 w-14 rounded border px-1 text-xs outline-none max-lg:min-h-11"
        aria-label={t('svgart.fill.offset')}
      />
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={stop.alpha}
        onChange={(e) => onChange({ ...stop, alpha: clamp01(Number(e.target.value)) })}
        className="accent-accent-line min-w-0 flex-1"
        aria-label={t('svgart.fill.stopAlpha')}
      />
      {canRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="text-muted flex h-6 w-6 shrink-0 items-center justify-center rounded transition hover:text-red-400"
          aria-label={t('svgart.fill.stop.delete')}
        >
          ✕
        </button>
      ) : (
        <span className="w-6 shrink-0" />
      )}
    </div>
  )
}

function ColorField({
  label,
  color,
  onChange,
}: {
  label: string
  color: RGB
  onChange: (c: RGB) => void
}): ReactElement {
  return (
    <label className="flex items-center gap-2">
      <input
        type="color"
        value={rgbToHex(color)}
        onChange={(e) => onChange(hexColor(e.target.value) ?? color)}
        className="border-line h-7 w-9 shrink-0 cursor-pointer rounded border bg-none p-0"
        aria-label={label}
      />
      <span className="text-muted text-xs">{label}</span>
    </label>
  )
}

function AlphaSlider({
  label,
  alpha,
  onChange,
}: {
  label: string
  alpha: number
  onChange: (a: number) => void
}): ReactElement {
  return (
    <Slider
      label={label}
      value={Math.round(alpha * 100)}
      min={0}
      max={100}
      onChange={(v) => onChange(v / 100)}
    />
  )
}

function sortStopsForEdit(stops: GradStop[]): GradStop[] {
  return [...stops].sort((a, b) => a.offset - b.offset)
}

function midColor(stops: GradStop[]): RGB {
  const first = stops[0]?.color
  const last = stops[stops.length - 1]?.color
  if (first === undefined || last === undefined) return mustHex('#808080')
  return {
    r: (first.r + last.r) / 2,
    g: (first.g + last.g) / 2,
    b: (first.b + last.b) / 2,
  }
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
}
