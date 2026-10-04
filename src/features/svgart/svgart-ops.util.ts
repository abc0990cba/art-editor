/**
 * Scene-level editing operations shared by the panels and the keyboard shortcuts: duplicate,
 * remove, z-order, nudging. Each helper is a pure (scene → scene) updater for `updateSvgArtScene`.
 */

import { translateLayer, type SvgLayer, type SvgScene } from '../../engine/svgart/index.ts'

export function removeLayerById(scene: SvgScene, id: string): SvgScene {
  return { ...scene, layers: scene.layers.filter((l) => l.id !== id) }
}

export function duplicateLayer(scene: SvgScene, id: string): { scene: SvgScene; newId: string } {
  const original = scene.layers.find((l) => l.id === id)
  if (!original) return { scene, newId: id }
  const copy: SvgLayer = translateLayer(
    { ...original, id: `${id}-c${scene.layers.length}`, name: `${original.name} ·c` },
    scene.width * 0.02,
    scene.height * 0.02,
  )
  return { scene: { ...scene, layers: [...scene.layers, copy] }, newId: copy.id }
}

export function reorderLayer(scene: SvgScene, id: string, target: 'front' | 'back'): SvgScene {
  const layer = scene.layers.find((l) => l.id === id)
  if (!layer) return scene
  const rest = scene.layers.filter((l) => l.id !== id)
  return {
    ...scene,
    layers: target === 'front' ? [...rest, layer] : [layer, ...rest],
  }
}

export function nudgeLayer(scene: SvgScene, id: string, dx: number, dy: number): SvgScene {
  return {
    ...scene,
    layers: scene.layers.map((l) => (l.id === id ? translateLayer(l, dx, dy) : l)),
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
