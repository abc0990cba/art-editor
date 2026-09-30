import { elementFromDoc, type Doc, type ElementStyle, type Link } from './doc.ts'
import { metaballGeometry } from './geometry-metaball.ts'
import { shapeGeometry } from './geometry-shape.ts'
import type { Geometry, StyledPath } from './geometry-types.ts'
import { gridBuildGeometry } from './grid-geometry.ts'
import { outlineGeometry } from './outline'

// element-scope scratch: reused across groups (see elementGeometry)
let mergeObjScratch: Uint32Array | null = null

/* ---------------------------------- element mode ---------------------------------- */

/** One render group: cells/links sharing an equal frozen element style. */
interface ElementGroup {
  el: ElementStyle
  cells: number[]
  links: Link[]
}

/**
 * Element-scope rendering: group painted cells by owning element, merge groups whose frozen styles
 * are equal (so same-style strokes merge into one metaball field / silhouette), then run the
 * regular per-mode builders over each group's virtual document. Unattributed cells and links
 * (legacy content, corrupt data) render as one bottom group with the doc-level style so nothing
 * ever disappears.
 */
/**
 * Stable style key per frozen ElementStyle object: the exact fields `sameElementStyle` compares, so
 * grouping by key matches the deep compare without rescanning all groups (O(ids) string keys once
 * per style object instead of O(ids²) field compares per frame).
 */
const styleKeyCache = new WeakMap<ElementStyle, string>()

export function elementStyleKey(el: ElementStyle): string {
  let k = styleKeyCache.get(el)
  if (k) return k
  const s = el.style
  k = [
    el.renderMode,
    el.connectivity,
    s.radius,
    s.sizeX,
    s.sizeY,
    s.convexRadius,
    s.concaveRadius,
    s.cornerStyle,
    s.squareEdges,
    s.shape,
    s.shapeParams.thickness,
    s.shapeParams.points,
    s.shapeParams.rotation,
    s.toneSize,
    s.toneSizeMin,
    s.corners.tl,
    s.corners.tr,
    s.corners.br,
    s.corners.bl,
    el.metaball.strength,
    el.metaball.perColor,
    el.metaball.quality,
    el.metaball.squareEdges,
    el.texture.effect,
    el.texture.amount,
    el.texture.scale,
    el.texture.sizeMin,
    el.texture.sizeMax,
    el.texture.shape,
    el.texture.edge,
    el.texture.dist,
    el.texture.gap,
    el.texture.gapMode,
    el.texture.even,
    el.texture.angle,
    el.texture.seed,
    el.texture.jitter,
    el.texture.variation,
    el.texture.wobble,
    el.texture.merge,
    el.texture.dropout,
    el.texture.spray,
    el.texture.ramp,
  ].join('|')
  styleKeyCache.set(el, k)
  return k
}

export function elementGeometry(
  doc: Doc,
  cells: Uint16Array,
  links: readonly Link[],
  stagingObjs?: ReadonlyMap<number, number | null>,
  preview = false,
): Geometry {
  let objs = doc.cellObj
  if (stagingObjs && stagingObjs.size > 0) {
    const base = objs ?? new Uint32Array(cells.length)
    let merged = mergeObjScratch
    if (!merged || merged.length !== base.length)
      merged = mergeObjScratch = new Uint32Array(base.length)
    merged.set(base)
    for (const [i, o] of stagingObjs) merged[i] = o === null ? 0 : o
    objs = merged
  }

  const fallback = elementFromDoc(doc)
  const groups: ElementGroup[] = []
  const byId = new Map<number, ElementGroup>()
  const byStyle = new Map<string, ElementGroup>()
  const groupFor = (id: number): ElementGroup => {
    let g = byId.get(id)
    if (!g) {
      const el = id >= 1 && doc.elements[id - 1] ? doc.elements[id - 1] : fallback
      // fuseObjects=false keeps every object its own field/silhouette, even when the
      // frozen styles are equal (Illustrator-style stacking instead of blob fusion)
      const styleKey = elementStyleKey(el)
      const key = doc.fuseObjects === false && id > 0 ? `${styleKey}\u0000${id}` : styleKey
      g = byStyle.get(key)
      if (!g) {
        g = { el, cells: [], links: [] }
        groups.push(g)
        byStyle.set(key, g)
      }
      byId.set(id, g)
    }
    return g
  }

  for (let i = 0; i < cells.length; i++) {
    const v = cells[i]
    if (v === 0) continue
    groupFor(objs ? objs[i] : 0).cells.push(i)
  }
  for (const l of links) {
    if (l.v === 0) continue
    groupFor(l.obj ?? 0).links.push(l)
  }

  // unattributed content sits below everything that was drawn with the element model
  const fallbackIdx = groups.indexOf(byId.get(0)!)
  let ordered = groups
  if (fallbackIdx > 0) {
    ordered = [...groups]
    ordered.unshift(ordered.splice(fallbackIdx, 1)[0])
  }

  const paths: StyledPath[] = []
  // per-group cell buffer reused across groups: each group's geometry is fully consumed
  // (path strings built) before the next group starts, so one scratch suffices
  let sub: Uint16Array | null = null
  for (const g of ordered) {
    if (g.cells.length === 0 && g.links.length === 0) continue
    if (!sub || sub.length !== cells.length) sub = new Uint16Array(cells.length)
    else sub.fill(0)
    for (const i of g.cells) sub[i] = cells[i]
    const vdoc: Doc = {
      ...doc,
      style: g.el.style,
      renderMode: g.el.renderMode,
      connectivity: g.el.connectivity,
      metaball: g.el.metaball,
      texture: g.el.texture,
      links: g.links,
    }
    let out: StyledPath[]
    if (doc.gridType !== 'square') out = gridBuildGeometry(vdoc, sub, g.links)
    else if (g.el.renderMode === 'metaball')
      out = metaballGeometry(vdoc, sub, g.links, preview).paths
    else if (g.el.renderMode === 'outline') out = outlineGeometry(vdoc, sub, g.links)
    else out = shapeGeometry(vdoc, sub, g.links).paths
    paths.push(...out)
  }
  return { paths }
}
