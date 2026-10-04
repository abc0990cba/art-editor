/**
 * Scene-level editing operations shared by the panels and the keyboard shortcuts: duplicate,
 * remove, z-order, nudging. Each helper is a pure (scene → scene) updater for `updateSvgArtScene`.
 */

import { translateLayer, type SvgLayer, type SvgScene } from '../../engine/svgart/index.ts'

export function removeLayersById(scene: SvgScene, ids: string[]): SvgScene {
  const set = new Set(ids)
  return { ...scene, layers: scene.layers.filter((l) => !set.has(l.id)) }
}

/** Multi-selection z-order: the selected stack keeps its internal order, moving as one block. */
export function reorderLayers(scene: SvgScene, ids: string[], target: 'front' | 'back'): SvgScene {
  const set = new Set(ids)
  const moving = scene.layers.filter((l) => set.has(l.id))
  if (moving.length === 0) return scene
  const rest = scene.layers.filter((l) => !set.has(l.id))
  return { ...scene, layers: target === 'front' ? [...rest, ...moving] : [...moving, ...rest] }
}

export function nudgeLayers(scene: SvgScene, ids: string[], dx: number, dy: number): SvgScene {
  const set = new Set(ids)
  return {
    ...scene,
    layers: scene.layers.map((l) => (set.has(l.id) ? translateLayer(l, dx, dy) : l)),
  }
}

/** Duplicate every selected layer (topmost last); returns the new ids alongside the scene. */
export function duplicateLayers(
  scene: SvgScene,
  ids: string[],
): { scene: SvgScene; newIds: string[] } {
  const copies: SvgLayer[] = []
  for (const id of ids) {
    const original = scene.layers.find((l) => l.id === id)
    if (original === undefined) continue
    copies.push(
      translateLayer(
        {
          ...original,
          id: `${id}-c${scene.layers.length + copies.length}`,
          name: `${original.name} ·c`,
        },
        scene.width * 0.02,
        scene.height * 0.02,
      ),
    )
  }
  return {
    scene: { ...scene, layers: [...scene.layers, ...copies] },
    newIds: copies.map((c) => c.id),
  }
}

/** Unique-ify layer ids after any clone operation (guards copy-of-copy collisions). */
export function withUniqueIds(scene: SvgScene): SvgScene {
  const seen = new Set<string>()
  return {
    ...scene,
    layers: scene.layers.map((l) => {
      let id = l.id
      while (seen.has(id)) id = `${id}+`
      seen.add(id)
      return id === l.id ? l : { ...l, id }
    }),
  }
}
