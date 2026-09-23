import type { Doc, ElementStyle, Link, PixelStyle } from './doc'
import { bufferHeight, bufferWidth, cellColor, elementFromDoc } from './doc'
import { marchingSquares, type Pt } from './marchingSquares'
import { outlineGeometry } from './outline'
import { gridBuildGeometry } from './gridGeometry'
import { fieldTextureFragments, regionTextureFragments, type TextureCell } from './texture'
import { visibleObjs } from './scene'
import { evalGraph } from './nodes'

export interface StyledPath {
  d: string
  fill?: string
  stroke?: string
  strokeWidth?: number
}

export interface Geometry {
  paths: StyledPath[]
}

export interface Staging {
  /** buffer index -> value (null = erase) applied on top of doc.cells */
  cells?: ReadonlyMap<number, number | null>
  /** replaces doc.links entirely when provided (preview) */
  links?: readonly Link[]
  /** element ids (null = clear) merged over doc.cellObj for the staged cells */
  objs?: ReadonlyMap<number, number | null>
  /**
   * Palette the staged values refer to — shape fills/strokes may resolve colors that
   * only join doc.palette at commit, so the preview needs the future palette to paint
   * them with their real colors.
   */
  palette?: readonly string[]
  /**
   * Scene docs: the layer staged INK belongs to (the active layer). Staged erases on
   * other layers are routed by each cell's composite owner instead, which keeps a
   * multi-layer move preview honest.
   */
  layerId?: number
}

const fmt = (v: number) => String(Math.round(v * 1000) / 1000)

/**
 * Rounded-rect path with radii [tl, tr, br, bl] clamped to the box. Chamfer style replaces
 * each corner arc with a straight 45° cut of the same tangent length.
 */
function roundedRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  radii: number[],
  chamfer = false,
): string {
  const maxR = Math.min(w, h) / 2
  const [tl, tr, br, bl] = radii.map((r) => Math.max(0, Math.min(r, maxR)))
  const join = (ex: number, ey: number, r: number) =>
    r > 0
      ? chamfer
        ? `L${fmt(ex)} ${fmt(ey)}`
        : `A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(ex)} ${fmt(ey)}`
      : ''
  let d = `M${fmt(x + tl)} ${fmt(y)}`
  d += `L${fmt(x + w - tr)} ${fmt(y)}`
  d += join(x + w, y + tr, tr)
  d += `L${fmt(x + w)} ${fmt(y + h - br)}`
  d += join(x + w - br, y + h, br)
  d += `L${fmt(x + bl)} ${fmt(y + h)}`
  d += join(x, y + h - bl, bl)
  d += `L${fmt(x)} ${fmt(y + tl)}`
  d += join(x + tl, y, tl)
  return d + 'Z'
}

/** Merge staging cell edits into a scratch copy of the buffer. The scratch is reused
 * across frames: a fresh copy per stroke frame allocates megabytes on large grids
 * (512×512×sub3 ≈ 2.36 M entries) and thrashes the GC mid-stroke. */
let mergeScratch: Uint16Array | null = null
let mergeObjScratch: Uint32Array | null = null

function mergedCells(doc: Doc, staging?: Staging): Uint16Array {
  const s = staging?.cells
  if (!s || s.size === 0) return doc.cells
  let c = mergeScratch
  if (!c || c.length !== doc.cells.length) c = mergeScratch = new Uint16Array(doc.cells.length)
  c.set(doc.cells)
  for (const [i, v] of s) c[i] = v === null ? 0 : v
  return c
}

/* ---------------------------------- shape mode ---------------------------------- */

/** Order: [tl, tr, br, bl]. Zero the corners whose sides face the canvas border. */
const borderRadii = (
  radii: number[],
  left: boolean,
  top: boolean,
  right: boolean,
  bottom: boolean,
): number[] => [
  left || top ? 0 : radii[0],
  top || right ? 0 : radii[1],
  right || bottom ? 0 : radii[2],
  bottom || left ? 0 : radii[3],
]

function shapeGeometry(doc: Doc, cells: Uint16Array, links: readonly Link[]): Geometry {
  const bw = bufferWidth(doc)
  const bh = bufferHeight(doc)
  const cw = doc.style.sizeX / doc.sub
  const ch = doc.style.sizeY / doc.sub
  const rBase = doc.style.radius * Math.min(cw, ch)
  const corner = (o: number | null) => (o === null ? rBase : o * Math.min(cw, ch))
  const radii = [
    corner(doc.style.corners.tl),
    corner(doc.style.corners.tr),
    corner(doc.style.corners.br),
    corner(doc.style.corners.bl),
  ]
  const chamfer = doc.style.cornerStyle === 'chamfer'
  const squareEdges = doc.style.squareEdges
  const tex = doc.texture
  const textured = tex.effect !== 'none'
  // texture is one continuous pattern per color: sides shared with the same
  // value stay connected (no seams), open sides carry the gap margin
  const texCells = textured ? new Map<number, TextureCell[]>() : undefined

  const groups = new Map<number, string[]>()
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const v = cells[by * bw + bx]
      if (v === 0) continue
      let frags = groups.get(v)
      if (!frags) groups.set(v, (frags = []))
      const x = bx / doc.sub + (1 / doc.sub - cw) / 2
      const y = by / doc.sub + (1 / doc.sub - ch) / 2
      const radiiHere =
        squareEdges && (bx === 0 || by === 0 || bx === bw - 1 || by === bh - 1)
          ? borderRadii(radii, bx === 0, by === 0, bx === bw - 1, by === bh - 1)
          : radii
      frags.push(roundedRectPath(x, y, cw, ch, radiiHere, chamfer))
      if (texCells) {
        const same = (xx: number, yy: number) =>
          xx >= 0 && yy >= 0 && xx < bw && yy < bh && cells[yy * bw + xx] === v
        let list = texCells.get(v)
        if (!list) texCells.set(v, (list = []))
        list.push({
          x,
          y,
          w: cw,
          h: ch,
          radii: radiiHere,
          chamfer,
          cx0: bx / doc.sub,
          cy0: by / doc.sub,
          cx1: (bx + 1) / doc.sub,
          cy1: (by + 1) / doc.sub,
          connectedL: same(bx - 1, by),
          connectedT: same(bx, by - 1),
          connectedR: same(bx + 1, by),
          connectedB: same(bx, by + 1),
        })
      }
    }
  }
  if (texCells) {
    for (const [v, list] of texCells) {
      const holes = regionTextureFragments(list, tex, v)
      if (holes) groups.get(v)!.push(holes)
    }
  }

  const paths: StyledPath[] = []
  for (const [v, frags] of groups) {
    paths.push({ d: frags.join(''), fill: cellColor(doc, v) ?? '#888' })
  }
  if (links.length > 0) {
    const byColor = new Map<number, string[]>()
    for (const l of links) {
      let frags = byColor.get(l.v)
      if (!frags) byColor.set(l.v, (frags = []))
      frags.push(`M${fmt(l.ax + 0.5)} ${fmt(l.ay + 0.5)}L${fmt(l.bx + 0.5)} ${fmt(l.by + 0.5)}`)
    }
    for (const [v, frags] of byColor) {
      paths.push({
        d: frags.join(''),
        stroke: cellColor(doc, v) ?? '#888',
        strokeWidth: doc.connectorWidth,
      })
    }
  }
  return { paths }
}

/* ---------------------------------- metaball mode ---------------------------------- */

const ISO = 0.5

/** Kernel radius in cell units: merges orthogonal neighbors from ~s=0 up; diagonals from ~s=80. */
function kernelRadius(doc: Doc): number {
  return (0.815 + (doc.metaball.strength / 100) * 0.44) / doc.sub
}

interface Field {
  f: Float32Array
  fw: number
  fh: number
  /** field node -> doc units */
  scale: number
}

function buildField(
  doc: Doc,
  cells: Uint16Array,
  links: readonly Link[],
  take: (v: number) => boolean,
  /** cap on the field side in nodes: lowered during in-stroke previews */
  maxSide: number,
): Field {
  const bw = bufferWidth(doc)
  const bh = bufferHeight(doc)
  const q = Math.max(1, Math.min(doc.metaball.quality, Math.floor(maxSide / Math.max(bw, bh)) || 1))
  const fw = bw * q + 1
  const fh = bh * q + 1
  const f = new Float32Array(fw * fh)
  const R = kernelRadius(doc) * doc.sub * q
  const R2 = R * R
  const w = doc.palette.length

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

  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const v = cells[by * bw + bx]
      if (v === 0 || v > w || !take(v)) continue
      splat((bx + 0.5) * q, (by + 0.5) * q)
    }
  }

  // corner connectivity: an extra kernel at each diagonal junction merges corner-touching
  // neighbors of the same value through the shared corner at any strength (both diagonals)
  if (doc.connectivity !== 'edge') {
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        const v = cells[by * bw + bx]
        if (v === 0 || v > w || !take(v)) continue
        const sideR = bx + 1 < bw ? cells[by * bw + bx + 1] : 0
        // ↘ junction with (bx+1, by+1)
        if (
          bx + 1 < bw &&
          by + 1 < bh &&
          cells[(by + 1) * bw + bx + 1] === v &&
          sideR === 0 &&
          cells[(by + 1) * bw + bx] === 0
        ) {
          splat((bx + 1) * q, (by + 1) * q)
        }
        // ↗ junction with (bx+1, by-1)
        if (
          bx + 1 < bw &&
          by - 1 >= 0 &&
          cells[(by - 1) * bw + bx + 1] === v &&
          sideR === 0 &&
          cells[(by - 1) * bw + bx] === 0
        ) {
          splat((bx + 1) * q, by * q)
        }
      }
    }
  }

  for (const l of links) {
    if (l.v === 0 || !take(l.v)) continue
    // link endpoints are in pixel cells: doc center (ax+0.5)/sub → field scale sub*q
    const ax = (l.ax + 0.5) * doc.sub * q
    const ay = (l.ay + 0.5) * doc.sub * q
    const bx = (l.bx + 0.5) * doc.sub * q
    const by = (l.by + 0.5) * doc.sub * q
    const minX = Math.min(ax, bx)
    const maxX = Math.max(ax, bx)
    const minY = Math.min(ay, by)
    const maxY = Math.max(ay, by)
    const x0 = Math.max(0, Math.ceil(minX - R))
    const x1 = Math.min(fw - 1, Math.floor(maxX + R))
    const y0 = Math.max(0, Math.ceil(minY - R))
    const y1 = Math.min(fh - 1, Math.floor(maxY + R))
    const abx = bx - ax
    const aby = by - ay
    const len2 = abx * abx + aby * aby
    for (let iy = y0; iy <= y1; iy++) {
      for (let ix = x0; ix <= x1; ix++) {
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

  // Clamp blobs at the canvas border so contours always close inside. With squareEdges the
  // border nodes mirror the adjacent inner node instead: blobs meeting the canvas edge lock
  // onto it and marching squares draws the shared stretch as a straight border segment.
  const mirror = doc.metaball.squareEdges
  for (let x = 0; x < fw; x++) {
    f[x] = mirror ? f[fw + x] : 0
    f[(fh - 1) * fw + x] = mirror ? f[(fh - 2) * fw + x] : 0
  }
  for (let y = 0; y < fh; y++) {
    f[y * fw] = mirror ? f[y * fw + 1] : 0
    f[y * fw + fw - 1] = mirror ? f[y * fw + fw - 2] : 0
  }
  return { f, fw, fh, scale: 1 / (doc.sub * q) }
}

/** Convert loops into one smooth compound path (midpoint quadratic smoothing), in doc units. */
function loopsToPath(loops: Pt[][], scale: number): string {
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
    const mid = (a: Pt, b: Pt) =>
      `${fmt(((a.x + b.x) / 2) * scale)} ${fmt(((a.y + b.y) / 2) * scale)}`
    const at = (i: number) => `${fmt(pts[i].x * scale)} ${fmt(pts[i].y * scale)}`
    d += `M${mid(pts[n - 1], pts[0])}`
    for (let i = 0; i < n; i++) {
      d += `Q${at(i)} ${mid(pts[i], pts[(i + 1) % n])}`
    }
    d += 'Z'
  }
  return d
}

function metaballGeometry(
  doc: Doc,
  cells: Uint16Array,
  links: readonly Link[],
  preview = false,
): Geometry {
  // while a stroke is in flight the field renders at half resolution; the committed
  // document always rebuilds at full quality, so only the live preview softens
  const maxSide = preview ? 360 : 700
  const paths: StyledPath[] = []
  const trace = (field: Field): Pt[][] => {
    if (!doc.metaball.squareEdges) return marchingSquares(field.f, field.fw, field.fh, ISO)
    // squareEdges: contours may run straight along the canvas border (through border
    // nodes). Pad the field with a zero ring first so those loops still close.
    const fw = field.fw + 2
    const fh = field.fh + 2
    const padded = new Float32Array(fw * fh)
    for (let y = 0; y < field.fh; y++) {
      padded.set(field.f.subarray(y * field.fw, (y + 1) * field.fw), (y + 1) * fw + 1)
    }
    return marchingSquares(padded, fw, fh, ISO).map((loop) =>
      loop.map((p) => ({ x: p.x - 1, y: p.y - 1 })),
    )
  }
  if (doc.metaball.perColor) {
    const order: number[] = []
    const seen = new Set<number>()
    for (let i = 0; i < cells.length; i++) {
      const v = cells[i]
      if (v !== 0 && !seen.has(v)) {
        seen.add(v)
        order.push(v)
      }
    }
    for (const l of links) {
      if (l.v !== 0 && !seen.has(l.v)) {
        seen.add(l.v)
        order.push(l.v)
      }
    }
    for (const v of order) {
      const field = buildField(doc, cells, links, (x) => x === v, maxSide)
      let d = loopsToPath(trace(field), field.scale)
      if (d && doc.texture.effect !== 'none') {
        d += fieldTextureFragments(field, doc.texture, v, doc.sub)
      }
      if (d) paths.push({ d, fill: cellColor(doc, v) ?? '#888' })
    }
  } else {
    // one merged field; fill with the dominant color among cells (fallback: first link)
    const counts = new Map<number, number>()
    for (let i = 0; i < cells.length; i++) {
      const v = cells[i]
      if (v !== 0) counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    let best = links.length > 0 ? links[0].v : 0
    let bestN = -1
    for (const [v, c] of counts) {
      if (c > bestN) {
        best = v
        bestN = c
      }
    }
    const field = buildField(doc, cells, links, () => true, maxSide)
    let d = loopsToPath(trace(field), field.scale)
    if (d && doc.texture.effect !== 'none') {
      d += fieldTextureFragments(field, doc.texture, best, doc.sub)
    }
    if (d) paths.push({ d, fill: cellColor(doc, best) ?? '#888' })
  }
  return { paths }
}

/* ---------------------------------- element mode ---------------------------------- */

/** One render group: cells/links sharing an equal frozen element style. */
interface ElementGroup {
  el: ElementStyle
  cells: number[]
  links: Link[]
}

/**
 * Element-scope rendering: group painted cells by owning element, merge groups whose frozen
 * styles are equal (so same-style strokes merge into one metaball field / silhouette), then
 * run the regular per-mode builders over each group's virtual document. Unattributed cells
 * and links (legacy content, corrupt data) render as one bottom group with the doc-level
 * style so nothing ever disappears.
 */
/** Stable style key per frozen ElementStyle object: the exact fields `sameElementStyle`
 * compares, so grouping by key matches the deep compare without rescanning all groups
 * (O(ids) string keys once per style object instead of O(ids²) field compares per frame). */
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

function elementGeometry(
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
    ordered = groups.slice()
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

/* ---------------------------------- entry ---------------------------------- */

// Per-layer scratch buffers: each layer's geometry is fully consumed (paths built)
// before the next layer starts, so one pair suffices no matter how many layers exist.
let sceneScratchCells: Uint16Array | null = null
let sceneScratchObjs: Uint32Array | null = null

/**
 * Scene rendering: one scoped buffer per visible layer, bottom → top. Each layer runs
 * through the regular builders in isolation, which is what makes layers independent
 * compositing spaces — metaball fields and outlines never fuse across layers.
 */
function sceneGeometry(doc: Doc, staging?: Staging): Geometry {
  const layers = doc.layers!
  const length = doc.cells.length
  const preview = !!(staging && staging.cells && staging.cells.size > 0)
  // staged erase cells without a layer tag punch wherever their composite owner lives
  const objLayerOf = new Map<number, number>()
  for (const layer of layers) {
    for (const o of visibleObjs(layer)) objLayerOf.set(o.id, layer.id)
  }
  const paths: StyledPath[] = []
  // staged ink without an explicit layer tag defaults to the topmost layer
  const inkLayerId = staging?.layerId ?? layers[layers.length - 1]?.id
  // graph objects evaluate their node graph; hex colors resolve against the derived palette
  const hexValue = (hex: string) => {
    const i = doc.palette.findIndex((c) => c.toLowerCase() === hex.toLowerCase())
    return (i >= 0 ? i : 0) + 1
  }
  for (const layer of layers) {
    if (!layer.visible) continue
    const objs = visibleObjs(layer)
    const stagedInk = inkLayerId === layer.id
    if (!sceneScratchCells || sceneScratchCells.length !== length) {
      sceneScratchCells = new Uint16Array(length)
    }
    if (!sceneScratchObjs || sceneScratchObjs.length !== length) {
      sceneScratchObjs = new Uint32Array(length)
    }
    const cells = sceneScratchCells
    const cellObjs = sceneScratchObjs
    cells.fill(0)
    cellObjs.fill(0)
    const links: Link[] = []
    for (const o of objs) {
      const { cells: ink } = o.graph
        ? evalGraph(o.graph, {
            bw: doc.cols * doc.sub,
            bh: doc.rows * doc.sub,
            paletteLen: length,
            hexValue,
            baseStyle: o.style,
          }, o.cells)
        : { cells: o.cells }
      for (const [i, v] of ink) cells[i] = v
      for (const [i] of ink) cellObjs[i] = o.id
      for (const l of o.links) if (l.v > 0) links.push(l)
    }
    // merge the staged delta into the layer it belongs to: ink goes to the active
    // layer, erases follow each cell's composite owner (multi-layer move previews)
    if (staging?.cells && (stagedInk || preview)) {
      for (const [i, v] of staging.cells) {
        if (v === null || v === 0) {
          const owner = doc.cellObj?.[i] ?? 0
          const home =
            owner > 0 ? (objLayerOf.get(owner) ?? -1) : stagedInk ? layer.id : -1
          if (home === layer.id) {
            cells[i] = 0
            cellObjs[i] = 0
          }
        } else if (stagedInk) {
          cells[i] = v
          cellObjs[i] = staging.objs?.get(i) ?? PENDING_OBJ
        }
      }
    }
    if (staging?.links) {
      for (const l of staging.links) {
        if (l.v === 0) continue
        const home = (l.obj != null && objLayerOf.get(l.obj)) ?? staging.layerId
        if (home === layer.id) links.push(l)
      }
    }
    if (cells.every((v) => v === 0) && links.length === 0) continue
    const scoped: Doc = { ...doc, cells, cellObj: cellObjs, links }
    if (doc.styleScope === 'element') {
      paths.push(...elementGeometry(scoped, cells, links, undefined, preview).paths)
    } else if (doc.gridType !== 'square') {
      paths.push(...gridBuildGeometry(scoped, cells, links))
    } else if (doc.renderMode === 'metaball') {
      paths.push(...metaballGeometry(scoped, cells, links, preview).paths)
    } else if (doc.renderMode === 'outline') {
      paths.push(...outlineGeometry(scoped, cells, links))
    } else {
      paths.push(...shapeGeometry(scoped, cells, links).paths)
    }
  }
  return { paths }
}

export function buildGeometry(doc: Doc, staging?: Staging): Geometry {
  if (doc.layers) return sceneGeometry(doc, staging)
  const cells = mergedCells(doc, staging)
  const links = staging?.links ?? doc.links
  const preview = !!(staging && staging.cells && staging.cells.size > 0)
  if (doc.styleScope === 'element' && (doc.cellObj || staging?.objs)) {
    return elementGeometry(doc, cells, links, staging?.objs, preview)
  }
  if (doc.gridType !== 'square') return { paths: gridBuildGeometry(doc, cells, links) }
  if (doc.renderMode === 'metaball') return metaballGeometry(doc, cells, links, preview)
  if (doc.renderMode === 'outline') return { paths: outlineGeometry(doc, cells, links) }
  return shapeGeometry(doc, cells, links)
}

/* ------------------------------- staging preview ------------------------------- */

/**
 * Element id used while a stroke is in flight: out of range for doc.elements, so staged
 * cells preview with the document-level drawing style — exactly the style they will be
 * frozen with when the stroke commits.
 */
export const PENDING_OBJ = 0xffffffff

export interface StagingPreview {
  /** staged ink: one path per (style group × color), drawn above the committed artwork */
  paths: StyledPath[]
  /** buffer indices staged as erased; the caller punches these out of the committed layer */
  erase: number[]
}

/**
 * Incremental in-stroke preview built from ONLY the staged cells — a frame costs
 * O(staged cells) instead of a full-document rebuild, which keeps drawing responsive on
 * 500×500+ grids with any corner-rounding option (fragments go through the same path
 * builders as shapeGeometry). Returns null when the preview needs global context and the
 * caller must fall back to buildGeometry: outline/metaball contours, baked textures,
 * connector edits and non-square grids all reshape content outside the staged cell set.
 */
export function stagingPreview(doc: Doc, staging: Staging): StagingPreview | null {
  const s = staging.cells
  if (!s || s.size === 0) return null
  if (doc.gridType !== 'square') return null
  // connector add/remove redraws every link — needs the full rebuild
  if (staging.links && staging.links.length !== doc.links.length) return null

  const elementScope = doc.styleScope === 'element' && (doc.cellObj || staging.objs)
  const fallback = elementFromDoc(doc)
  const usable = (el: ElementStyle) => el.renderMode === 'pixels' && el.texture.effect === 'none'
  // global scope renders outline/metaball/textured docs canvas-wide, erase included
  if (!elementScope && !usable(fallback)) return null

  const bw = bufferWidth(doc)
  const bh = bufferHeight(doc)
  interface Group {
    style: PixelStyle
    frags: Map<number, string[]>
  }
  const groups = new Map<string, Group>()
  const erase: number[] = []

  for (const [i, v] of s) {
    if (v === null || v === 0) {
      // erasing reshapes the contour of whatever element owned the cell
      const owner = elementScope ? (doc.cellObj?.[i] ?? 0) : 0
      if (owner > 0) {
        const el = doc.elements[owner - 1]
        if (el && !usable(el)) return null
      }
      erase.push(i)
      continue
    }
    const id = elementScope ? (staging.objs?.get(i) ?? doc.cellObj?.[i] ?? 0) : 0
    const el =
      id >= 1 && id !== PENDING_OBJ && doc.elements[id - 1] ? doc.elements[id - 1] : fallback
    if (!usable(el)) return null
    const key = elementStyleKey(el)
    let g = groups.get(key)
    if (!g) groups.set(key, (g = { style: el.style, frags: new Map() }))
    let frags = g.frags.get(v)
    if (!frags) g.frags.set(v, (frags = []))
    const cw = el.style.sizeX / doc.sub
    const ch = el.style.sizeY / doc.sub
    const bx = i % bw
    const by = (i - bx) / bw
    const x = bx / doc.sub + (1 / doc.sub - cw) / 2
    const y = by / doc.sub + (1 / doc.sub - ch) / 2
    const rBase = el.style.radius * Math.min(cw, ch)
    const corner = (o: number | null) => (o === null ? rBase : o * Math.min(cw, ch))
    const radii = [
      corner(el.style.corners.tl),
      corner(el.style.corners.tr),
      corner(el.style.corners.br),
      corner(el.style.corners.bl),
    ]
    const radiiHere =
      el.style.squareEdges && (bx === 0 || by === 0 || bx === bw - 1 || by === bh - 1)
        ? borderRadii(radii, bx === 0, by === 0, bx === bw - 1, by === bh - 1)
        : radii
    frags.push(roundedRectPath(x, y, cw, ch, radiiHere, el.style.cornerStyle === 'chamfer'))
  }

  const paths: StyledPath[] = []
  const colorOf = (v: number) =>
    staging.palette
      ? (staging.palette[(v - 1) % staging.palette.length] ?? '#888')
      : (cellColor(doc, v) ?? '#888')
  for (const g of groups.values()) {
    for (const [v, frags] of g.frags) {
      paths.push({ d: frags.join(''), fill: colorOf(v) })
    }
  }
  return { paths, erase }
}

/** Squared distance from a pixel-cell coordinate to a link (for eraser hit testing). */
export function distanceToLinkSq(l: Link, px: number, py: number): number {
  const ax = l.ax + 0.5
  const ay = l.ay + 0.5
  const bx = l.bx + 0.5
  const by = l.by + 0.5
  const abx = bx - ax
  const aby = by - ay
  const len2 = abx * abx + aby * aby
  let t = len2 > 0 ? ((px + 0.5 - ax) * abx + (py + 0.5 - ay) * aby) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  const dx = px + 0.5 - (ax + t * abx)
  const dy = py + 0.5 - (ay + t * aby)
  return dx * dx + dy * dy
}
