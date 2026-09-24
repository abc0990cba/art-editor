import type { Doc, Link } from './doc'
import { cellColor } from './doc'
import type { StyledPath } from './geometry'
import { makeGrid, type Grid } from './grids'
import { marchingSquares, type Pt } from './marchingSquares'
import { emitFilletPath } from './outline'

const fmt = (v: number) => String(Math.round(v * 1000) / 1000)
const q6 = (v: number) => Math.round(v * 1e6) / 1e6

/**
 * Rendering for non-square grids (hex / triangle / radial). All three pixel styles are supported:
 * rounded cell polygons, generic union-silhouette outline tracing, and center-kernel metaball
 * fields. Corner connectivity and sub-cells are square-grid features.
 */
export function gridBuildGeometry(
  doc: Doc,
  cells: Uint16Array,
  links: readonly Link[],
): StyledPath[] {
  const grid = makeGrid(doc.gridType, doc.cols, doc.rows, doc.radialEven)

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
      let d = ''
      for (const i of list) {
        const poly = scaledPolygon(grid.polygon(i), doc.style.sizeX, doc.style.sizeY)
        d += roundedPolygonPath(
          poly,
          doc.style.radius * (minEdge(poly) / 2),
          doc.style.cornerStyle === 'chamfer',
        )
      }
      if (d) paths.push({ d, fill: cellColor(doc, v) ?? '#888' })
    }
  }

  appendGridLinkStrokes(doc, links, grid, paths)
  return paths
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

function minEdge(poly: Pt[]): number {
  let m = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    m = Math.min(m, Math.hypot(b.x - a.x, b.y - a.y))
  }
  return m
}

/** Rounded polygon: fillet every true corner (turns below 10° read as arc samples). */
function roundedPolygonPath(poly: Pt[], r: number, chamfer: boolean): string {
  const n = poly.length
  const corners: number[] = []
  for (let i = 0; i < n; i++) {
    const a = poly[(i - 1 + n) % n]
    const b = poly[i]
    const c = poly[(i + 1) % n]
    const d1x = b.x - a.x
    const d1y = b.y - a.y
    const d2x = c.x - b.x
    const d2y = c.y - b.y
    const l1 = Math.hypot(d1x, d1y)
    const l2 = Math.hypot(d2x, d2y)
    if (l1 === 0 || l2 === 0) continue
    const cos = (d1x * d2x + d1y * d2y) / (l1 * l2)
    if (cos < 0.985) corners.push(i) // turn angle above ~10°
  }
  if (corners.length < 3) {
    // degenerate: plain polygon
    return `M${poly.map((p) => `${fmt(p.x)} ${fmt(p.y)}`).join('L')}Z`
  }
  const isCorner = new Set(corners)
  let d = ''
  let first = true
  for (let i = 0; i < n; i++) {
    if (!isCorner.has(i)) {
      // arc sample between corners (radial rings): keep it, or the whole curved
      // edge collapses into the straight chord joining the two fillets
      d += `${first ? 'M' : 'L'}${fmt(poly[i].x)} ${fmt(poly[i].y)}`
      first = false
      continue
    }
    const p = poly[i]
    const prev = poly[(i - 1 + n) % n]
    const next = poly[(i + 1) % n]
    const inLen = Math.hypot(p.x - prev.x, p.y - prev.y)
    const outLen = Math.hypot(next.x - p.x, next.y - p.y)
    const t = Math.min(r, inLen / 2, outLen / 2)
    const d1x = (p.x - prev.x) / inLen
    const d1y = (p.y - prev.y) / inLen
    const d2x = (next.x - p.x) / outLen
    const d2y = (next.y - p.y) / outLen
    const ax = p.x - d1x * t
    const ay = p.y - d1y * t
    const bx = p.x + d2x * t
    const by = p.y + d2y * t
    d += `${first ? 'M' : 'L'}${fmt(ax)} ${fmt(ay)}`
    first = false
    if (t > 0) {
      const cross = d1x * d2y - d1y * d2x
      d += chamfer
        ? `L${fmt(bx)} ${fmt(by)}`
        : `A${fmt(t)} ${fmt(t)} 0 0 ${cross > 0 ? 1 : 0} ${fmt(bx)} ${fmt(by)}`
    }
  }
  return d + 'Z'
}

/* ------------------------------- outline tracer ------------------------------- */

interface BEdge {
  a: Pt
  b: Pt
  key: string
}

/** Boundary loops of the union of same-value cells, traced along shared polygon edges. */
function traceSilhouette(grid: Grid, cells: Uint16Array, list: number[]): Pt[][] {
  const edgeOwners = new Map<string, Array<{ i: number; v: number; a: Pt; b: Pt }>>()
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

function gridMetaball(
  doc: Doc,
  grid: Grid,
  cells: Uint16Array,
  groups: Map<number, number[]>,
  paths: StyledPath[],
): void {
  const step = Math.max(0.05, Math.max(grid.w, grid.h) / 600)
  const fw = Math.ceil(grid.w / step) + 1
  const fh = Math.ceil(grid.h / step) + 1
  // kernel radius in cells, converted to field units (1 field unit = step doc units)
  const R = (0.815 + (doc.metaball.strength / 100) * 0.44) / doc.sub / step
  const R2 = R * R
  const scale = step

  const buildField = (list: number[]): Float32Array => {
    const f = new Float32Array(fw * fh)
    const splat = (cxf: number, cyf: number) => {
      const x0 = Math.max(0, Math.ceil(cxf - R))
      const x1 = Math.min(fw - 1, Math.floor(cxf + R))
      const y0 = Math.max(0, Math.ceil(cyf - R))
      const y1 = Math.min(fh - 1, Math.floor(cyf + R))
      for (let iy = y0; iy <= y1; iy++) {
        const dy = iy - cyf
        for (let ix = x0; ix <= x1; ix++) {
          const dx = ix - cxf
          const d2 = dx * dx + dy * dy
          if (d2 < R2) {
            const t = 1 - d2 / R2
            f[iy * fw + ix] += t * t * t
          }
        }
      }
    }
    for (const i of list) {
      const c = grid.center(i)
      splat(c.x / scale, c.y / scale)
    }
    for (const l of doc.links) {
      const a = grid.center(l.ax)
      const b = grid.center(l.bx)
      const ax = a.x / scale
      const ay = a.y / scale
      const bx = b.x / scale
      const by = b.y / scale
      const minX = Math.min(ax, bx)
      const maxX = Math.max(ax, bx)
      const minY = Math.min(ay, by)
      const maxY = Math.max(ay, by)
      const abx = bx - ax
      const aby = by - ay
      const len2 = abx * abx + aby * aby
      for (
        let iy = Math.max(0, Math.ceil(minY - R));
        iy <= Math.min(fh - 1, Math.floor(maxY + R));
        iy++
      ) {
        for (
          let ix = Math.max(0, Math.ceil(minX - R));
          ix <= Math.min(fw - 1, Math.floor(maxX + R));
          ix++
        ) {
          let t = len2 > 0 ? ((ix - ax) * abx + (iy - ay) * aby) / len2 : 0
          t = Math.max(0, Math.min(1, t))
          const dx = ix - (ax + t * abx)
          const dy = iy - (ay + t * aby)
          const d2 = dx * dx + dy * dy
          if (d2 < R2) {
            const k = 1 - d2 / R2
            f[iy * fw + ix] += k * k * k
          }
        }
      }
    }
    for (let x = 0; x < fw; x++) {
      f[x] = 0
      f[(fh - 1) * fw + x] = 0
    }
    for (let y = 0; y < fh; y++) {
      f[y * fw] = 0
      f[y * fw + fw - 1] = 0
    }
    return f
  }

  const emit = (list: number[], fill: string) => {
    const f = buildField(list)
    const loops = marchingSquares(f, fw, fh, 0.5)
    const d = loopsToDocPath(loops, scale)
    if (d) paths.push({ d, fill })
  }

  if (doc.metaball.perColor) {
    for (const [v, list] of groups) emit(list, cellColor(doc, v) ?? '#888')
  } else {
    const all = [...groups.values()].flat()
    const first = all.length > 0 ? cells[all[0]] : 0
    emit(all, cellColor(doc, first) ?? '#888')
  }
}

function loopsToDocPath(loops: Pt[][], scale: number): string {
  let d = ''
  for (const raw of loops) {
    const pts: Pt[] = []
    for (const p of raw) {
      const last = pts[pts.length - 1]
      if (!last || Math.abs(last.x - p.x) > 1e-9 || Math.abs(last.y - p.y) > 1e-9) pts.push(p)
    }
    if (pts.length > 2) {
      const first = pts[0]
      const lastP = pts[pts.length - 1]
      if (Math.abs(first.x - lastP.x) < 1e-9 && Math.abs(first.y - lastP.y) < 1e-9) pts.pop()
    }
    const n = pts.length
    if (n < 3) continue
    const at = (i: number) => `${fmt(pts[i].x * scale)} ${fmt(pts[i].y * scale)}`
    const mid = (a: Pt, b: Pt) =>
      `${fmt(((a.x + b.x) / 2) * scale)} ${fmt(((a.y + b.y) / 2) * scale)}`
    d += `M${mid(pts[n - 1], pts[0])}`
    for (let i = 0; i < n; i++) d += `Q${at(i)} ${mid(pts[i], pts[(i + 1) % n])}`
    d += 'Z'
  }
  return d
}
