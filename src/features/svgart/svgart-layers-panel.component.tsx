import type { ReactElement } from 'react'

import { mustHex, paintPreviewHex, type SvgLayer } from '../../engine/svgart/index.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { Chip, Section } from '../../shared/ui/index.tsx'
import { useStore } from '../../state/editor.store.ts'
import {
  newShapeLayer,
  newSoftLayer,
  type ShapeKind,
  type SoftKind,
} from './svgart-factory.util.ts'

/**
 * Layer list of the studio scene, topmost first, with visibility, reorder, delete — and the add
 * rows: parametric shapes and AI-safe soft layers (gradient falloffs, never filters).
 */
export function SvgArtLayersPanel(): ReactElement {
  const { t } = useI18n()
  const scene = useStore((s) => s.svgartScene)
  const selection = useStore((s) => s.svgartSelection)
  const select = useStore((s) => s.selectSvgArtLayer)
  const updateScene = useStore((s) => s.updateSvgArtScene)

  const addLayer = (layer: SvgLayer): void => {
    updateScene((s) => ({ ...s, layers: [...s.layers, layer] }))
    select(layer.id, 0)
  }
  const patchLayer = (id: string, patch: Partial<(typeof scene.layers)[number]>): void => {
    updateScene((s) => ({
      ...s,
      layers: s.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }))
  }
  const removeLayer = (id: string): void => {
    updateScene((s) => ({ ...s, layers: s.layers.filter((l) => l.id !== id) }))
    select(null)
  }
  const moveLayer = (id: string, delta: -1 | 1): void => {
    updateScene((s) => {
      const i = s.layers.findIndex((l) => l.id === id)
      const j = i + delta
      if (i < 0 || j < 0 || j >= s.layers.length) return s
      const layers = [...s.layers]
      const [moved] = layers.splice(i, 1)
      if (moved === undefined) return s
      layers.splice(j, 0, moved)
      return { ...s, layers }
    })
  }

  return (
    <Section title={t('svgart.layers')} icon="layers" defaultOpen>
      <div className="flex flex-col gap-1">
        {[...scene.layers].reverse().map((layer) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            active={selection.layerId === layer.id}
            onSelect={() => select(layer.id, 0)}
            onToggleVisible={() => patchLayer(layer.id, { visible: !layer.visible })}
            onUp={() => moveLayer(layer.id, 1)}
            onDown={() => moveLayer(layer.id, -1)}
            onRemove={() => removeLayer(layer.id)}
          />
        ))}
        {scene.layers.length === 0 && (
          <p className="text-muted text-overline">{t('svgart.layers.empty')}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {(['rect', 'ellipse', 'star', 'ngon', 'blob', 'ring'] as const).map((kind) => (
          <Chip
            key={kind}
            onClick={() => addLayer(newShapeLayer(kind as ShapeKind, scene, scene.layers.length))}
          >
            + {t(`svgart.add.${kind}` as 'svgart.add.rect')}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {(['shadow', 'glow', 'highlight'] as const).map((kind) => (
          <Chip
            key={kind}
            onClick={() => addLayer(newSoftLayer(kind as SoftKind, scene, scene.layers.length))}
          >
            + {t(`svgart.soft.${kind}` as 'svgart.soft.shadow')}
          </Chip>
        ))}
      </div>
    </Section>
  )
}

function LayerRow({
  layer,
  active,
  onSelect,
  onToggleVisible,
  onUp,
  onDown,
  onRemove,
}: {
  layer: SvgLayer
  active: boolean
  onSelect: () => void
  onToggleVisible: () => void
  onUp: () => void
  onDown: () => void
  onRemove: () => void
}): ReactElement {
  const { t } = useI18n()
  return (
    <div
      className={`border-line flex items-center gap-1 rounded-md border px-1 py-0.5 transition ${
        active ? 'border-accent-line bg-accent-soft' : 'hover:bg-chip-active'
      }`}
    >
      <button
        type="button"
        onClick={onToggleVisible}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs ${layer.visible ? 'text-body' : 'text-muted'}`}
        aria-label={t('svgart.layer.visible')}
      >
        {layer.visible ? '◉' : '○'}
      </button>
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
      >
        <span
          className="border-line h-3.5 w-3.5 shrink-0 rounded-sm border"
          style={{
            background: paintPreviewHex(
              layer.fills[0] ?? { kind: 'solid', color: mustHex('#808080'), alpha: 1 },
            ),
          }}
        />
        <span className="text-body truncate text-xs">{layer.name}</span>
      </button>
      <button
        type="button"
        onClick={onUp}
        className="text-muted hover:text-body h-6 w-5 shrink-0 rounded text-xs"
        aria-label={t('svgart.layer.up')}
      >
        ↑
      </button>
      <button
        type="button"
        onClick={onDown}
        className="text-muted hover:text-body h-6 w-5 shrink-0 rounded text-xs"
        aria-label={t('svgart.layer.down')}
      >
        ↓
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="text-muted h-6 w-5 shrink-0 rounded text-xs hover:text-red-400"
        aria-label={t('svgart.layer.delete')}
      >
        ✕
      </button>
    </div>
  )
}
