import type { ReactElement } from 'react'

import type { Shape, SvgLayer } from '../../engine/svgart/index.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { Section, Slider } from '../../shared/ui/index.tsx'
import { useStore } from '../../state/editor.store.ts'

/**
 * Parameters of the selected studio layer: name, opacity and the per-kind geometry fields (star
 * rays/inner radius, rect size/radius, ellipse axes, rotation for all parametric kinds).
 */
export function SvgArtShapePanel(): ReactElement | null {
  const { t } = useI18n()
  const scene = useStore((s) => s.svgartScene)
  const selection = useStore((s) => s.svgartSelection)
  const updateScene = useStore((s) => s.updateSvgArtScene)
  const layer = scene.layers.find((l) => l.id === selection.layerId)
  if (!layer) return null
  const extent = Math.min(scene.width, scene.height)

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

  return (
    <Section title={t('svgart.shape.section')} icon="style" defaultOpen>
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
      <ShapeFields shape={layer.shape} extent={extent} onPatch={patchShape} />
    </Section>
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
