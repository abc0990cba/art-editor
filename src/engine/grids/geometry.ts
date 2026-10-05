import { makeGrid, type Grid } from '.'
import { cellShapeFragment } from '../cell-shapes/index.ts'
import { toneScale } from '../color/color.ts'
import type { Doc, Link } from '../core/doc'
import { cellColor } from '../core/doc'
import { hasJitter, jitterAt } from '../effects/jitter.ts'
import type { StyledPath } from '../geometry'
import type { Pt } from '../geometry/marching-squares.ts'
import {
  buildMetaballField,
  loopsToSmoothPath,
  metaballIso,
  traceMetaballLoops,
} from '../geometry/metaball-field.ts'
import type { MetaballCapsule, MetaballField, MetaballSource } from '../geometry/metaball-field.ts'
import { emitFilletPath } from '../geometry/outline'
import { minCornerRun, roundedPolygonPath } from '../geometry/poly-path.ts'

const fmt = (v: number) => String(Math.round(v * 1000) / 1000)
const q6 = (v: number) => Math.round(v * 1e6) / 1e6

/**
 * Rendering for non-square grids (hex / triangle / radial). All pixel styles are supported: rounded
 * native cell polygons, the registered cell forms of the shape registry (form + tone-driven size in
 * each cell's bounding box; `square` keeps the native polygon), generic union-silhouette outline
 * tracing, and center-kernel metaball fields. Corner connectivity and sub-cells are square-grid
 * features.
 */
export function gridBuildGeometry(
  doc: Doc,
  cells: Uint16Array,
  links: readonly Link[],
): StyledPath[] {
  const grid = makeGrid(doc.gridType, doc.cols, doc.rows, doc.radialEven, doc.gridRotation ?? 0)

  // ordered color groups with their cell indices
  const groups = new Map<number, number[]>()
  for (let i = 0; i < cells.length; i++) {
    const v = cells[i]
    if (v === 0) continue
    let list = groups.get(v)
    if (!list) groups.set(v, (list = []))
    list.push(i)
  }

  const paths: StyledPath[] = []
  if (doc.renderMode === 'metaball') {
    gridMetaball(doc, grid, cells, groups, paths)
    return paths
  }

  for (const [v, list] of groups) {
    if (doc.renderMode === 'outline') {
      const loops = traceSilhouette(grid, cells, list)
      const d = emitFilletPath(
        loops,
        doc.style.convexRadius,
        doc.style.concaveRadius,
        doc.style.cornerStyle === 'chamfer',
      )
      if (d) paths.push({ d, fill: cellColor(doc, v) ?? '#888' })
    } else {
      gridPixels(doc, grid, cells, list, paths)
    }
  }

  appendGridLinkStrokes(doc, links, grid, paths)
  return paths
}

/**
 * Pixels mode of the non-square grids: the native cell polygon (form `square`, rounded and scaled),
 * or a registered cell form drawn into each cell's bounding box — size and tone scaling collapse
 * the box about its center, mirroring the square-grid per-cell path in geometry-shape.
 */
function gridPixels(
  doc: Doc,
  grid: Grid,
  cells: Uint16Array,
  list: number[],
  paths: StyledPath[],
): void {
  const shape = doc.style.shape
  const toneSize = doc.style.toneSize
  const jitterOn = hasJitter(doc.style)
  const toneOf = new Map<number, number>()
  const toneScaleOf = (val: number): number => {
    let k = toneOf.get(val)
    if (k === undefined) {
      k = toneScale(cellColor(doc, val) ?? '#ffffff', doc.style.toneSizeMin)
      toneOf.set(val, k)
    }
    return k
  }
  let d = ''
  for (const i of list) {
    const poly = grid.polygon(i)
    // deterministic per-cell size/angle variation, composed after tone scaling
    const j = jitterOn ? jitterAt(doc.style, i, doc.cols) : null
    if (shape === 'square') {
      const scaled = scaledPolygon(
        poly,
        doc.style.sizeX * (j?.size ?? 1),
        doc.style.sizeY * (j?.size ?? 1),
      )
      const oriented = j?.angle ? rotatePolygon(scaled, j.angle) : scaled
      // radius is a fraction of the cell's shortest true edge (collinear splits and arc runs
      // merged): hex at 0.5 rounds to a circle, a radial wedge to a leaf — same feel as the
      // square grid, where radius is a fraction of the cell side
      d += roundedPolygonPath(
        oriented,
        doc.style.radius * minCornerRun(oriented),
        doc.style.cornerStyle === 'chamfer',
      )
    } else {
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const p of poly) {
        minX = Math.min(minX, p.x)
        minY = Math.min(minY, p.y)
        maxX = Math.max(maxX, p.x)
        maxY = Math.max(maxY, p.y)
      }
      let w = (maxX - minX) * doc.style.sizeX
      let h = (maxY - minY) * doc.style.sizeY
      if (toneSize) {
        const k = toneScaleOf(cells[i])
        w *= k
        h *= k
      }
      if (j) {
        w *= j.size
        h *= j.size
      }
      let params = doc.style.shapeParams
      if (j?.angle) {
        params = { ...params, rotation: (params.rotation + j.angle + 360) % 360 }
      }
      d += cellShapeFragment({
        id: shape,
        x: (minX + maxX) / 2 - w / 2,
        y: (minY + maxY) / 2 - h / 2,
        w,
        h,
        params,
        radius: doc.style.radius,
        chamfer: doc.style.cornerStyle === 'chamfer',
      })
    }
  }
  if (d) paths.push({ d, fill: cellColor(doc, cells[list[0]]) ?? '#888' })
}

function appendGridLinkStrokes(
  doc: Doc,
  links: readonly Link[],
  grid: Grid,
  paths: StyledPath[],
): void {
  if (links.length === 0) return
  const byColor = new Map<number, string[]>()
  for (const l of links) {
    let frags = byColor.get(l.v)
    if (!frags) byColor.set(l.v, (frags = []))
    const a = grid.center(l.ax)
    const b = grid.center(l.bx)
    frags.push(`M${fmt(a.x)} ${fmt(a.y)}L${fmt(b.x)} ${fmt(b.y)}`)
  }
  for (const [v, frags] of byColor) {
    paths.push({
      d: frags.join(''),
      stroke: cellColor(doc, v) ?? '#888',
      strokeWidth: doc.connectorWidth,
    })
  }
}

function scaledPolygon(poly: Pt[], sx: number, sy: number): Pt[] {
  if (sx === 1 && sy === 1) return poly
  const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length
  const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length
  return poly.map((p) => ({ x: cx + (p.x - cx) * sx, y: cy + (p.y - cy) * sy }))
}

/** Rotate a polygon about its centroid by whole degrees (per-cell angle jitter). */
function rotatePolygon(poly: Pt[], deg: number): Pt[] {
  if (deg === 0) return poly
  const a = (deg * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length
  const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length
  return poly.map((p) => {
    const dx = p.x - cx
    const dy = p.y - cy
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
  })
}

/* ------------------------------- outline tracer ------------------------------- */

interface BEdge {
  a: Pt
  b: Pt
  key: string
}

/** Boundary loops of the union of same-value cells, traced along shared polygon edges. */
function traceSilhouette(grid: Grid, cells: Uint16Array, list: number[]): Pt[][] {
  const edgeOwners = new Map<string, { i: number; v: number; a: Pt; b: Pt }[]>()
  for (const i of list) {
    const poly = grid.polygon(i)
    const v = cells[i]
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k]
      const b = poly[(k + 1) % poly.length]
      const pa = `${q6(a.x)},${q6(a.y)}`
      const pb = `${q6(b.x)},${q6(b.y)}`
      // canonical (undirected) key so both cells sharing the edge meet in one entry
      const key = pa < pb ? `${pa}|${pb}` : `${pb}|${pa}`
      let arr = edgeOwners.get(key)
      if (!arr) edgeOwners.set(key, (arr = []))
      arr.push({ i, v, a, b })
    }
  }

  // boundary edges: owned by a group cell and not shared with another cell of the same value
  const edges: BEdge[] = []
  const byPoint = new Map<string, number[]>()
  const addPoint = (key: string, idx: number) => {
    let arr = byPoint.get(key)
    if (!arr) byPoint.set(key, (arr = []))
    arr.push(idx)
  }
  edgeOwners.forEach((owners, key) => {
    // interior edge: exactly two owners of the same value
    if (owners.length === 2 && owners[0].v === owners[1].v) return
    // one directed boundary edge per owner cell (winding direction)
    for (const o of owners) {
      const idx = edges.length
      edges.push({ a: o.a, b: o.b, key })
      addPoint(`${q6(o.a.x)},${q6(o.a.y)}`, idx)
      addPoint(`${q6(o.b.x)},${q6(o.b.y)}`, idx)
    }
  })

  // chain boundary edges into loops by shared endpoints
  const used = new Set<number>()
  const loops: Pt[][] = []
  const pkey = (p: Pt) => `${q6(p.x)},${q6(p.y)}`
  for (let start = 0; start < edges.length; start++) {
    if (used.has(start)) continue
    used.add(start)
    const loop: Pt[] = [edges[start].a, edges[start].b]
    let cur = pkey(edges[start].b)
    let guard = edges.length * 2
    while (cur !== pkey(edges[start].a) && guard-- > 0) {
      const cands = (byPoint.get(cur) ?? []).filter((e) => !used.has(e))
      if (cands.length === 0) break
      const next = cands[0]
      used.add(next)
      const e = edges[next]
      // orient: continue from the shared point
      if (pkey(e.a) === cur) {
        loop.push(e.b)
        cur = pkey(e.b)
      } else {
        loop.push(e.a)
        cur = pkey(e.a)
      }
    }
    // the walk pushes the closing point: drop the wrap-around duplicate
    if (loop.length > 1 && pkey(loop[loop.length - 1]) === pkey(loop[0])) loop.pop()
    if (loop.length >= 3) loops.push(loop)
  }
  return loops
}

/* ---------------------------------- metaball ---------------------------------- */

/**
 * Merged metaball field over the whole non-square grid: kernel splats at every painted cell center
 * plus link capsules, filtered by `take`. Also serves the diffusion-guides contour.
 */
export function gridMetaballField(
  doc: Doc,
  grid: Grid,
  cells: Uint16Array,
  take: (v: number) => boolean,
): MetaballField {
  const step = Math.max(0.05, Math.max(grid.w, grid.h) / 600)
  const capsules: MetaballCapsule[] = doc.links.map((l) => {
    const a = grid.center(l.ax)
    const b = grid.center(l.bx)
    return { ax: a.x, ay: a.y, bx: b.x, by: b.y, v: l.v }
  })
  const sources: MetaballSource[] = []
  for (let i = 0; i < cells.length; i++) {
    const v = cells[i]
    if (v === 0) continue
    const c = grid.center(i)
    // splats follow the local cell size (√-scaled): radial inner rings have arc lengths far
    // below the unit pitch, and unit kernels swell lone cells ~4× while saturating the center.
    // The square root keeps same-ring neighbors merging gooey-ly like square-grid neighbors.
    sources.push({ x: c.x, y: c.y, v, r: Math.sqrt(minCornerRun(grid.polygon(i))) })
  }
  return buildMetaballField({
    w: grid.w,
    h: grid.h,
    step,
    sources,
    capsules,
    take,
    strength: doc.metaball.strength,
    sub: doc.sub,
    falloff: doc.metaball.falloff,
    squareEdges: false,
  })
}

function gridMetaball(
  doc: Doc,
  grid: Grid,
  cells: Uint16Array,
  groups: Map<number, number[]>,
  paths: StyledPath[],
): void {
  const emit = (take: (v: number) => boolean, fill: string) => {
    const field = gridMetaballField(doc, grid, cells, take)
    const loops = traceMetaballLoops(field, metaballIso(doc), false)
    const d = loopsToSmoothPath(loops, field.scale)
    if (d) paths.push({ d, fill })
  }

  if (doc.metaball.perColor) {
    for (const [v, list] of groups) {
      if (list.length === 0) continue
      emit((x) => x === v, cellColor(doc, v) ?? '#888')
    }
  } else {
    const all = [...groups.values()].flat()
    const first = all.length > 0 ? cells[all[0]] : 0
    emit(() => true, cellColor(doc, first) ?? '#888')
  }
}
