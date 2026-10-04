import type { Doc } from '../../engine/core/doc.ts'
import { isPlainSquare } from '../../engine/grids/index.ts'
import { useStore } from '../../state/editor.store.ts'
import type { StyleTarget } from './style-section.component.tsx'

/**
 * Selection-aware style target for the Style/Texture sections: with a selection active in element
 * scope the patches go to the selected elements' frozen styles (views shown from the first one);
 * otherwise they edit the canvas-wide drawing style. Picking a color with a selection active also
 * re-fills the selected shapes with it.
 */
export function useStyleTarget(doc: Doc, selection: number[]): StyleTarget {
  const patchStyle = useStore((s) => s.patchStyle)
  const setRenderMode = useStore((s) => s.setRenderMode)
  const setConnectivity = useStore((s) => s.setConnectivity)
  const patchMetaball = useStore((s) => s.patchMetaball)
  const patchTexture = useStore((s) => s.patchTexture)
  const patchExtrude = useStore((s) => s.patchExtrude)
  const setColor = useStore((s) => s.setColor)
  const restyleSelection = useStore((s) => s.restyleSelection)
  const fillSelection = useStore((s) => s.fillSelection)

  const elementMode = doc.styleScope === 'element'
  const targetSelection = elementMode && selection.length > 0
  const firstEl = targetSelection ? doc.elements[selection[0] - 1] : undefined
  return {
    styleView: firstEl ? firstEl.style : doc.style,
    modeView: firstEl ? firstEl.renderMode : doc.renderMode,
    connView: firstEl ? firstEl.connectivity : doc.connectivity,
    mbView: firstEl ? firstEl.metaball : doc.metaball,
    texView: firstEl ? firstEl.texture : doc.texture,
    exView: firstEl ? firstEl.extrude : doc.extrude,
    elementMode,
    targetSelection,
    isSquare: isPlainSquare(doc),
    applyStyle: (patch) =>
      targetSelection ? restyleSelection({ style: patch }) : patchStyle(patch),
    applyRenderMode: (mode) =>
      targetSelection ? restyleSelection({ renderMode: mode }) : setRenderMode(mode),
    applyConnectivity: (c) =>
      targetSelection ? restyleSelection({ connectivity: c }) : setConnectivity(c),
    applyMetaball: (patch) =>
      targetSelection ? restyleSelection({ metaball: patch }) : patchMetaball(patch),
    applyTexture: (patch) =>
      targetSelection ? restyleSelection({ texture: patch }) : patchTexture(patch),
    applyExtrude: (patch) =>
      targetSelection ? restyleSelection({ extrude: patch }) : patchExtrude(patch),
    applyColor: (hex) => {
      setColor(hex)
      if (targetSelection) fillSelection()
    },
  }
}
