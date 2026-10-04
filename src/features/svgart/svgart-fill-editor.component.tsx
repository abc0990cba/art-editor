import type { ReactElement } from 'react'

import {
  evenStops,
  jitterStops,
  mustHex,
  paintCompat,
  paintToCss,
  rampFromColors,
  reverseStops,
  shapeBBox,
  type GradStop,
  type Paint,
  type RGB,
  type SvgLayer,
} from '../../engine/svgart/index.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { Chip, Section } from '../../shared/ui/index.tsx'
import { useStore } from '../../state/editor.store.ts'
import { PaintEditor } from './svgart-paint-editor.component.tsx'
import { STOP_RAMPS } from './svgart-ramps.util.ts'

/**
 * The selected layer's fill stack: solid/linear/radial paints painted bottom-to-top, each clipped
 * to the layer shape. Adds reorder/duplicate, stop quick operations (reverse/even) and one-tap
 * palette ramps. Every effect here is AI-safe; the badge marks the radial focus (the one "verify in
 * your Illustrator" construct, see docs/research/ai-import.md).
 */
export function SvgArtFillEditor(): ReactElement | null {
  const { t } = useI18n()
  const scene = useStore((s) => s.svgartScene)
  const selection = useStore((s) => s.svgartSelection)
  const updateScene = useStore((s) => s.updateSvgArtScene)
  const select = useStore((s) => s.selectSvgArtLayer)
  const layer = scene.layers.find((l) => l.id === selection.layerId)
  if (!layer) return null
  const selectedFill = layer.fills[selection.fillIndex]

  const patchLayer = (next: SvgLayer): void => {
    updateScene((s) => ({ ...s, layers: s.layers.map((l) => (l.id === layer.id ? next : l)) }))
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
  const duplicateFill = (index: number): void => {
    const copy = structuredCloneFill(layer.fills[index])
    if (!copy) return
    const fills = layer.fills.slice()
    fills.splice(index + 1, 0, copy)
    patchLayer({ ...layer, fills })
    select(layer.id, index + 1)
  }
  const moveFill = (index: number, delta: 1 | -1): void => {
    const j = index + delta
    if (j < 0 || j >= layer.fills.length) return
    const fills = [...layer.fills]
    const [moved] = fills.splice(index, 1)
    if (moved === undefined) return
    fills.splice(j, 0, moved)
    patchLayer({ ...layer, fills })
    select(layer.id, j)
  }
  const patchFill = (index: number, paint: Paint): void => {
    const fills = layer.fills.slice()
    fills[index] = paint
    patchLayer({ ...layer, fills })
  }
  const applyStopOp = (op: 'reverse' | 'even'): void => {
    if (!selectedFill || selectedFill.kind === 'solid') return
    const stops =
      op === 'reverse' ? reverseStops(selectedFill.stops) : evenStops(selectedFill.stops)
    patchFill(selection.fillIndex, { ...selectedFill, stops })
  }
  const applyRamp = (colors: RGB[]): void => {
    if (!selectedFill || selectedFill.kind === 'solid') return
    patchFill(selection.fillIndex, { ...selectedFill, stops: rampFromColors(colors, 1) })
  }
  const jitter = (): void => {
    if (!selectedFill || selectedFill.kind === 'solid') return
    patchFill(selection.fillIndex, {
      ...selectedFill,
      stops: jitterStops(selectedFill.stops, 0.05, Math.floor(Math.random() * 2 ** 31)),
    })
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
            first={i === 0}
            last={i === layer.fills.length - 1}
            onSelect={() => select(layer.id, i)}
            onUp={() => moveFill(i, 1)}
            onDown={() => moveFill(i, -1)}
            onDuplicate={() => duplicateFill(i)}
            onRemove={() => removeFill(i)}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        <Chip onClick={() => addFill('solid')}>+ {t('svgart.fill.solid')}</Chip>
        <Chip onClick={() => addFill('linear')}>+ {t('svgart.fill.linear')}</Chip>
        <Chip onClick={() => addFill('radial')}>+ {t('svgart.fill.radial')}</Chip>
      </div>
      {selectedFill && (
        <>
          <PaintEditor
            paint={selectedFill}
            onChange={(paint) => patchFill(selection.fillIndex, paint)}
          />
          {selectedFill.kind !== 'solid' && (
            <StopsQuickOps
              onEven={() => applyStopOp('even')}
              onJitter={jitter}
              onRamp={applyRamp}
              onReverse={() => applyStopOp('reverse')}
            />
          )}
        </>
      )}
    </Section>
  )
}

/** Reverse / distribute / grain chips plus the palette-ramp swatches (gradient fills only). */
function StopsQuickOps({
  onEven,
  onJitter,
  onRamp,
  onReverse,
}: {
  onEven: () => void
  onJitter: () => void
  onRamp: (colors: RGB[]) => void
  onReverse: () => void
}): ReactElement {
  const { t } = useI18n()
  return (
    <div className="border-line flex flex-col gap-1 border-t pt-2">
      <div className="flex flex-wrap gap-1">
        <Chip onClick={onReverse} title={t('svgart.fill.reverse.desc')}>
          {t('svgart.fill.reverse')}
        </Chip>
        <Chip onClick={onEven} title={t('svgart.fill.even.desc')}>
          {t('svgart.fill.even')}
        </Chip>
        <Chip onClick={onJitter} title={t('svgart.fill.jitter.desc')}>
          {t('svgart.fill.jitter')}
        </Chip>
      </div>
      <div className="flex flex-wrap gap-1">
        {STOP_RAMPS.map((ramp) => {
          const label = t(`svgart.ramp.${ramp.id}` as 'svgart.ramp.sunset')
          return (
            <button
              key={ramp.id}
              type="button"
              onClick={() => onRamp(ramp.colors)}
              title={label}
              aria-label={label}
              className="border-line h-7 w-10 shrink-0 overflow-hidden rounded-md border"
            >
              <span
                className="block h-full w-full"
                style={{
                  background: `linear-gradient(90deg, ${ramp.colors
                    .map(
                      (c, i) =>
                        `${paintToCss({ kind: 'solid', color: c, alpha: 1 })} ${(i / (ramp.colors.length - 1)) * 100}%`,
                    )
                    .join(', ')})`,
                }}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function structuredCloneFill(paint: Paint | undefined): Paint | null {
  if (!paint) return null
  if (paint.kind === 'solid') return { ...paint }
  return { ...paint, stops: paint.stops.map((s) => ({ ...s, color: { ...s.color } })) }
}

function FillRow({
  paint,
  layer,
  active,
  first,
  last,
  onSelect,
  onUp,
  onDown,
  onDuplicate,
  onRemove,
}: {
  paint: Paint
  layer: SvgLayer
  active: boolean
  first: boolean
  last: boolean
  onSelect: () => void
  onUp: () => void
  onDown: () => void
  onDuplicate: () => void
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
          onClick={onUp}
          disabled={last}
          className="text-muted hover:text-body flex h-6 w-5 shrink-0 items-center justify-center rounded text-xs transition disabled:opacity-40"
          aria-label={t('svgart.fill.up')}
        >
          ↑
        </button>
        <button
          type="button"
          onClick={onDown}
          disabled={first}
          className="text-muted hover:text-body flex h-6 w-5 shrink-0 items-center justify-center rounded text-xs transition disabled:opacity-40"
          aria-label={t('svgart.fill.down')}
        >
          ↓
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          className="text-muted hover:text-body flex h-6 w-5 shrink-0 items-center justify-center rounded text-xs transition"
          aria-label={t('svgart.fill.duplicate')}
        >
          ⧉
        </button>
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
