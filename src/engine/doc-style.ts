import { sameShapeParams } from './cell-shapes.ts'
import type { Doc, ElementStyle, PixelStyle, StyleScope } from './doc.ts'

/** The element style non-element (global-scope) ink renders with. */
export function elementFromDoc(doc: Doc): ElementStyle {
  return {
    style: {
      ...doc.style,
      corners: { ...doc.style.corners },
      shapeParams: { ...doc.style.shapeParams },
    },
    renderMode: doc.renderMode,
    connectivity: doc.connectivity,
    metaball: { ...doc.metaball },
    texture: { ...doc.texture },
  }
}

/** Deep equality of two frozen element styles (render grouping merges equal elements). */
export function sameElementStyle(a: ElementStyle, b: ElementStyle): boolean {
  return (
    a.renderMode === b.renderMode &&
    a.connectivity === b.connectivity &&
    samePixelStyle(a.style, b.style) &&
    a.metaball.strength === b.metaball.strength &&
    a.metaball.perColor === b.metaball.perColor &&
    a.metaball.quality === b.metaball.quality &&
    a.metaball.squareEdges === b.metaball.squareEdges &&
    a.texture.effect === b.texture.effect &&
    a.texture.amount === b.texture.amount &&
    a.texture.scale === b.texture.scale &&
    a.texture.sizeMin === b.texture.sizeMin &&
    a.texture.sizeMax === b.texture.sizeMax &&
    a.texture.shape === b.texture.shape &&
    a.texture.edge === b.texture.edge &&
    a.texture.dist === b.texture.dist &&
    a.texture.gap === b.texture.gap &&
    a.texture.angle === b.texture.angle &&
    a.texture.seed === b.texture.seed &&
    a.texture.jitter === b.texture.jitter &&
    a.texture.variation === b.texture.variation &&
    a.texture.wobble === b.texture.wobble &&
    a.texture.merge === b.texture.merge &&
    a.texture.dropout === b.texture.dropout &&
    a.texture.spray === b.texture.spray &&
    a.texture.ramp === b.texture.ramp
  )
}

function samePixelStyle(a: PixelStyle, b: PixelStyle): boolean {
  return (
    a.radius === b.radius &&
    a.sizeX === b.sizeX &&
    a.sizeY === b.sizeY &&
    a.convexRadius === b.convexRadius &&
    a.concaveRadius === b.concaveRadius &&
    a.cornerStyle === b.cornerStyle &&
    a.squareEdges === b.squareEdges &&
    a.shape === b.shape &&
    sameShapeParams(a.shapeParams, b.shapeParams) &&
    a.corners.tl === b.corners.tl &&
    a.corners.tr === b.corners.tr &&
    a.corners.br === b.corners.br &&
    a.corners.bl === b.corners.bl
  )
}

/**
 * Flip the style scope. Entering element mode attributes all painted cells and unattributed
 * connectors to a single frozen element carrying a snapshot of the current global style, so the
 * rendered picture does not change. Leaving element mode keeps the element data intact.
 */
export function withStyleScope(doc: Doc, scope: StyleScope): Doc {
  if (doc.styleScope === scope) return doc
  // scene docs own every cell through their objects, so a scope flip needs no
  // materialization pass — hidden legacy globals just render through the tree
  if (doc.layers) return { ...doc, styleScope: scope }
  if (scope === 'global') return { ...doc, styleScope: scope }
  const snapshot = elementFromDoc(doc)
  const elements = [...doc.elements]
  let id = elements.findIndex((el) => sameElementStyle(el, snapshot)) + 1
  if (id === 0) {
    elements.push(snapshot)
    id = elements.length
  }
  let cellObj = doc.cellObj
  if (doc.cells.some((v) => v !== 0)) {
    cellObj = (cellObj ?? new Uint32Array(doc.cells.length)).slice()
    for (let i = 0; i < cellObj.length; i++) {
      if (doc.cells[i] !== 0 && cellObj[i] === 0) cellObj[i] = id
    }
  }
  const links = doc.links.some((l) => !l.obj)
    ? doc.links.map((l) => (l.obj ? l : { ...l, obj: id }))
    : doc.links
  return { ...doc, styleScope: scope, elements, cellObj, links }
}
