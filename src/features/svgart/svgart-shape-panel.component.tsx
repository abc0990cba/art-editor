import { useRef, type ReactElement } from 'react'

import {
  alignLayer,
  flipLayer,
  mirroredCopy,
  rotatedCopies,
  scaleLayer,
  shapeCenter,
  translateLayer,
  type BlendMode,
  type Shape,
  type SvgLayer,
} from '../../engine/svgart/index.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { Chip, Section, Slider } from '../../shared/ui/index.tsx'
import { useStore } from '../../state/editor.store.ts'
import { selectedIds } from '../../state/svgart.slice.ts'
import { duplicateLayers, reorderLayers, withUniqueIds } from './svgart-ops.util.ts'

/**
 * Parameters of the selected studio layer: quick actions (duplicate, flips, align, z-order), name,
 * opacity, position/scale, and the per-kind geometry fields (star rays/inner radius, rect
 * size/radius, ellipse axes, rotation for all parametric kinds).
 */
export function SvgArtShapePanel(): ReactElement | null {
  const { t } = useI18n()
  const scene = useStore((s) => s.svgartScene)
  const selection = useStore((s) => s.svgartSelection)
  const updateScene = useStore((s) => s.updateSvgArtScene)
  const select = useStore((s) => s.selectSvgArtLayer)
  const layer = scene.layers.find((l) => l.id === selection.layerId)
  const ids = selectedIds(selection)
  // Scale slider state is per-layer: moving the selection resets it to 100%.
  const scale = useRef({ id: '', value: 100 })
  if (!layer) return null
  if (scale.current.id !== layer.id) scale.current = { id: layer.id, value: 100 }
  const extent = Math.min(scene.width, scene.height)
  const center = shapeCenter(layer.shape)
  const sceneCenter = { x: scene.width / 2, y: scene.height / 2 }

  const patchShape = (next: Shape): void => {
    updateScene((s) => ({
      ...s,
      layers: s.layers.map((l) => (l.id === layer.id ? { ...l, shape: next } : l)),
    }))
  }
  const patchLayer = (patch: Partial<SvgLayer>): void => {
    updateScene((s) => ({
      ...s,
      layers: s.layers.map((l) => (l.id === layer.id ? { ...l, ...patch } : l)),
    }))
  }
  const mapSelected = (update: (l: SvgLayer) => SvgLayer): void => {
    updateScene((s) => ({ ...s, layers: s.layers.map((l) => (l.id === layer.id ? update(l) : l)) }))
  }
  const moveTo = (x: number, y: number): void => {
    const c = shapeCenter(layer.shape)
    mapSelected((l) => translateLayer(l, x - c.x, y - c.y))
  }
  const duplicate = (): void => {
    const { scene: next, newIds } = duplicateLayers(scene, ids)
    updateScene(() => withUniqueIds(next))
    select(newIds.at(-1) ?? null, 0)
  }
  /** Quick actions act on the whole selection; the panel fields stay on the primary. */
  const mapAllSelected = (update: (l: SvgLayer) => SvgLayer): void => {
    const set = new Set(ids)
    updateScene((s) => ({ ...s, layers: s.layers.map((l) => (set.has(l.id) ? update(l) : l)) }))
  }
  const radialRepeat = (count: number): void => {
    const copies = rotatedCopies(layer, count, { x: scene.width / 2, y: scene.height / 2 })
    updateScene((s) => withUniqueIds({ ...s, layers: [...s.layers, ...copies] }))
  }
  const mirrorCopy = (): void => {
    const twin = mirroredCopy(layer, 'x', { x: scene.width / 2, y: 0 })
    updateScene((s) => withUniqueIds({ ...s, layers: [...s.layers, twin] }))
  }

  return (
    <Section title={t('svgart.shape.section')} icon="style" defaultOpen>
      <div className="flex flex-wrap gap-1">
        <QuickAction label="⧉" title={t('svgart.quick.duplicate')} onClick={duplicate} />
        <QuickAction
          label="↔"
          title={t('svgart.quick.flipH')}
          onClick={() => mapAllSelected((l) => flipLayer(l, 'x'))}
        />
        <QuickAction
          label="↕"
          title={t('svgart.quick.flipV')}
          onClick={() => mapAllSelected((l) => flipLayer(l, 'y'))}
        />
        <QuickAction
          label="⌖"
          title={t('svgart.quick.center')}
          onClick={() => mapAllSelected((l) => alignLayer(l, sceneCenter))}
        />
        <QuickAction
          label="⤒"
          title={t('svgart.quick.front')}
          onClick={() => updateScene((s) => withUniqueIds(reorderLayers(s, ids, 'front')))}
        />
        <QuickAction
          label="⤓"
          title={t('svgart.quick.back')}
          onClick={() => updateScene((s) => withUniqueIds(reorderLayers(s, ids, 'back')))}
        />
      </div>
      <RepeatRow onMirror={mirrorCopy} onRepeat={radialRepeat} />
      <BlendChips
        blend={layer.blend}
        onChange={(blend) =>
          updateScene((s) => ({
            ...s,
            layers: s.layers.map((l) => (ids.includes(l.id) ? { ...l, blend } : l)),
          }))
        }
      />
      <label className="flex flex-col gap-1">
        <span className="text-muted text-xs">{t('svgart.layer.name')}</span>
        <input
          type="text"
          value={layer.name}
          onChange={(e) => patchLayer({ name: e.target.value })}
          className="border-line bg-chip text-body focus:border-accent-line h-7 rounded-md border px-2 text-xs outline-none max-lg:min-h-11 max-lg:text-base"
        />
      </label>
      <Slider
        label={t('svgart.field.opacity')}
        value={Math.round(layer.opacity * 100)}
        min={0}
        max={100}
        onChange={(v) => patchLayer({ opacity: v / 100 })}
      />
      <Slider
        label={t('svgart.field.x')}
        value={Math.round(center.x)}
        min={-Math.round(scene.width / 2)}
        max={Math.round(scene.width * 1.5)}
        editable
        int
        onChange={(v) => moveTo(v, Math.round(center.y))}
      />
      <Slider
        label={t('svgart.field.y')}
        value={Math.round(center.y)}
        min={-Math.round(scene.height / 2)}
        max={Math.round(scene.height * 1.5)}
        editable
        int
        onChange={(v) => moveTo(Math.round(center.x), v)}
      />
      <Slider
        label={t('svgart.field.scale')}
        value={scale.current.value}
        min={5}
        max={400}
        display={(v) => `${v}%`}
        onChange={(v) => {
          const factor = v / scale.current.value
          scale.current.value = v
          mapSelected((l) => scaleLayer(l, factor))
        }}
      />
      <ShapeFields shape={layer.shape} extent={extent} onPatch={patchShape} />
    </Section>
  )
}

function QuickAction({
  label,
  title,
  onClick,
}: {
  label: string
  title: string
  onClick: () => void
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="border-line bg-chip text-body hover:border-chip-line hover:bg-chip-active flex h-7 min-w-7 items-center justify-center rounded-md border px-1 text-xs transition max-lg:h-11 max-lg:flex-1"
    >
      {label}
    </button>
  )
}

function ShapeFields({
  shape,
  extent,
  onPatch,
}: {
  shape: Shape
  extent: number
  onPatch: (next: Shape) => void
}): ReactElement {
  const { t } = useI18n()
  if (shape.kind === 'poly') {
    return (
      <p className="text-muted text-overline">
        {t('svgart.shape.poly')} · {shape.points.length}
      </p>
    )
  }
  if (shape.kind === 'path') {
    return <p className="text-muted text-overline">{t('svgart.shape.path')}</p>
  }
  const rotation = (
    <Slider
      label={t('svgart.field.rotation')}
      value={Math.round(shape.rotation)}
      min={-180}
      max={180}
      onChange={(v) => onPatch({ ...shape, rotation: v })}
    />
  )
  if (shape.kind === 'rect') {
    return (
      <>
        <Slider
          label={t('svgart.field.width')}
          value={Math.round(shape.w)}
          min={2}
          max={extent * 2}
          onChange={(v) => onPatch({ ...shape, w: v })}
        />
        <Slider
          label={t('svgart.field.height')}
          value={Math.round(shape.h)}
          min={2}
          max={extent * 2}
          onChange={(v) => onPatch({ ...shape, h: v })}
        />
        <Slider
          label={t('svgart.field.radius')}
          value={Math.round(shape.radius)}
          min={0}
          max={Math.round(extent / 2)}
          onChange={(v) => onPatch({ ...shape, radius: v })}
        />
        {rotation}
      </>
    )
  }
  if (shape.kind === 'ellipse') {
    return (
      <>
        <Slider
          label={t('svgart.field.rx')}
          value={Math.round(shape.rx)}
          min={2}
          max={extent}
          onChange={(v) => onPatch({ ...shape, rx: v })}
        />
        <Slider
          label={t('svgart.field.ry')}
          value={Math.round(shape.ry)}
          min={2}
          max={extent}
          onChange={(v) => onPatch({ ...shape, ry: v })}
        />
        {rotation}
      </>
    )
  }
  return (
    <>
      <Slider
        label={t('svgart.field.R')}
        value={Math.round(shape.R)}
        min={4}
        max={extent}
        onChange={(v) => onPatch({ ...shape, R: v })}
      />
      <Slider
        label={t('svgart.field.r')}
        value={Math.round(shape.r)}
        min={2}
        max={extent}
        onChange={(v) => onPatch({ ...shape, r: v })}
      />
      <Slider
        label={t('svgart.field.points')}
        value={shape.points}
        min={3}
        max={24}
        onChange={(v) => onPatch({ ...shape, points: Math.round(v) })}
      />
      {rotation}
    </>
  )
}

const BLEND_MODES: BlendMode[] = [
  'multiply',
  'screen',
  'overlay',
  'soft-light',
  'hard-light',
  'darken',
  'lighten',
]

/** Per-layer blend mode; browser-only, so the chips carry the AI badge in their tooltip. */
function BlendChips({
  blend,
  onChange,
}: {
  blend: BlendMode | undefined
  onChange: (blend: BlendMode | undefined) => void
}): ReactElement {
  const { t } = useI18n()
  return (
    <div className="border-line flex flex-col gap-1 border-t pt-2">
      <span className="text-muted text-xs">{t('svgart.blend.title')}</span>
      <div className="flex flex-wrap gap-1">
        <Chip
          active={blend === undefined}
          onClick={() => onChange(undefined)}
          title={t('svgart.ai.safe')}
        >
          {t('svgart.blend.normal')}
        </Chip>
        {BLEND_MODES.map((mode) => (
          <Chip
            key={mode}
            active={blend === mode}
            onClick={() => onChange(mode)}
            title={`${t('svgart.blend.browserOnly')} — ${mode}`}
          >
            {mode}
          </Chip>
        ))}
      </div>
      <span className="text-muted text-overline">{t('svgart.blend.note')}</span>
    </div>
  )
}

/** Radial-repeat preset counts around the scene center, plus a mirrored twin copy. */
function RepeatRow({
  onMirror,
  onRepeat,
}: {
  onMirror: () => void
  onRepeat: (count: number) => void
}): ReactElement {
  const { t } = useI18n()
  return (
    <div className="flex flex-wrap gap-1">
      <span className="text-muted flex h-7 items-center text-xs max-lg:hidden">
        {t('svgart.quick.repeat')}
      </span>
      {[4, 6, 8, 12].map((n) => (
        <QuickAction
          key={n}
          label={`×${n}`}
          title={`${t('svgart.quick.repeat')} ×${n}`}
          onClick={() => onRepeat(n)}
        />
      ))}
      <QuickAction label="⇄" title={t('svgart.quick.mirror')} onClick={onMirror} />
    </div>
  )
}
