import { useRef, type ReactElement } from 'react'

import {
  alignLayer,
  flipLayer,
  mirroredCopy,
  rotatedCopies,
  scaleLayer,
  shapeCenter,
  translateLayer,
  type Shape,
  type SvgLayer,
} from '../../engine/svgart/index.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { Section, Slider } from '../../shared/ui/index.tsx'
import { useStore } from '../../state/editor.store.ts'
import { duplicateLayer, reorderLayer, withUniqueIds } from './svgart-ops.util.ts'

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
    const { scene: next, newId } = duplicateLayer(scene, layer.id)
    updateScene(() => withUniqueIds(next))
    select(newId, 0)
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
          onClick={() => mapSelected((l) => flipLayer(l, 'x'))}
        />
        <QuickAction
          label="↕"
          title={t('svgart.quick.flipV')}
          onClick={() => mapSelected((l) => flipLayer(l, 'y'))}
        />
        <QuickAction
          label="⌖"
          title={t('svgart.quick.center')}
          onClick={() => mapSelected((l) => alignLayer(l, sceneCenter))}
        />
        <QuickAction
          label="⤒"
          title={t('svgart.quick.front')}
          onClick={() => updateScene((s) => withUniqueIds(reorderLayer(s, layer.id, 'front')))}
        />
        <QuickAction
          label="⤓"
          title={t('svgart.quick.back')}
          onClick={() => updateScene((s) => withUniqueIds(reorderLayer(s, layer.id, 'back')))}
        />
      </div>
      <div className="flex flex-wrap gap-1">
        <span className="text-muted flex h-7 items-center text-xs max-lg:hidden">
          {t('svgart.quick.repeat')}
        </span>
        {[4, 6, 8, 12].map((n) => (
          <QuickAction
            key={n}
            label={`×${n}`}
            title={`${t('svgart.quick.repeat')} ×${n}`}
            onClick={() => radialRepeat(n)}
          />
        ))}
        <QuickAction label="⇄" title={t('svgart.quick.mirror')} onClick={mirrorCopy} />
      </div>
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
