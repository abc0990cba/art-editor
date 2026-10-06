import { sameShapeParams } from '../cell-shapes/index.ts'
import type {
  Doc,
  ElementStyle,
  ExtrudeSettings,
  MetaballSettings,
  PixelStyle,
  StyleScope,
} from './doc.ts'
import { sameField } from './field.ts'
import { sameInlay } from './inlay.ts'
import { sameStroke } from './stroke.ts'

/** The element style non-element (global-scope) ink renders with. */
export function elementFromDoc(doc: Doc): ElementStyle {
  return {
    style: {
      ...doc.style,
      corners: { ...doc.style.corners },
      shapeParams: { ...doc.style.shapeParams },
      inlay: { ...doc.style.inlay },
      field: { ...doc.style.field },
      stroke: { ...doc.style.stroke },
    },
    renderMode: doc.renderMode,
    connectivity: doc.connectivity,
    metaball: { ...doc.metaball },
    texture: { ...doc.texture },
    extrude: { ...doc.extrude },
  }
}

/** Equality of the metaball block of two frozen element styles. */
function sameMetaball(a: MetaballSettings, b: MetaballSettings): boolean {
  return (
    a.strength === b.strength &&
    a.perColor === b.perColor &&
    a.quality === b.quality &&
    a.squareEdges === b.squareEdges &&
    a.iso === b.iso &&
    a.falloff === b.falloff &&
    a.unit === b.unit &&
    a.blockSize === b.blockSize &&
    a.strokeWidth === b.strokeWidth
  )
}

/** Equality of the extrude block of two frozen element styles. */
function sameExtrude(a: ExtrudeSettings, b: ExtrudeSettings): boolean {
  return a.depth === b.depth && a.dx === b.dx && a.dy === b.dy && a.color === b.color
}

/** Equality of the texture block of two frozen element styles. */
function sameTexture(a: ElementStyle['texture'], b: ElementStyle['texture']): boolean {
  return (
    a.effect === b.effect &&
    a.amount === b.amount &&
    a.scale === b.scale &&
    a.sizeMin === b.sizeMin &&
    a.sizeMax === b.sizeMax &&
    a.shape === b.shape &&
    a.edge === b.edge &&
    a.dist === b.dist &&
    a.gap === b.gap &&
    a.gapMode === b.gapMode &&
    a.even === b.even &&
    a.angle === b.angle &&
    a.seed === b.seed &&
    a.jitter === b.jitter &&
    a.variation === b.variation &&
    a.wobble === b.wobble &&
    a.merge === b.merge &&
    a.dropout === b.dropout &&
    a.spray === b.spray &&
    a.ramp === b.ramp &&
    a.htLattice === b.htLattice &&
    a.hatchStyle === b.hatchStyle
  )
}

/** Deep equality of two frozen element styles (render grouping merges equal elements). */
export function sameElementStyle(a: ElementStyle, b: ElementStyle): boolean {
  return (
    a.renderMode === b.renderMode &&
    a.connectivity === b.connectivity &&
    samePixelStyle(a.style, b.style) &&
    sameMetaball(a.metaball, b.metaball) &&
    sameExtrude(a.extrude, b.extrude) &&
    sameTexture(a.texture, b.texture)
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
    a.toneSize === b.toneSize &&
    a.toneSizeMin === b.toneSizeMin &&
    a.sizeJitter === b.sizeJitter &&
    a.angleJitter === b.angleJitter &&
    a.jitterSeed === b.jitterSeed &&
    sameInlay(a.inlay, b.inlay) &&
    sameField(a.field, b.field) &&
    sameStroke(a.stroke, b.stroke) &&
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
