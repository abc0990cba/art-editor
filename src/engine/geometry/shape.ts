import { cellShapeFragment } from '../cell-shapes/index.ts'
import { toneScale } from '../color/color.ts'
import {
  bufferHeight,
  bufferWidth,
  cellColor,
  type Doc,
  type Link,
  type TextureSettings,
} from '../core/doc.ts'
import { hasJitter, jitterAt } from '../effects/jitter.ts'
import { figureSpace, type FigureSpace } from '../texture/figure.ts'
import { regionTextureFragments, type TextureCell } from '../texture/index.ts'
import { FNV_OFFSET, fnvFloat, fnvWord } from '../texture/region-index.ts'
import type { Geometry, Staging, StyledPath } from './types.ts'

export const fmt = (v: number) => String(Math.round(v * 1000) / 1000)

/**
 * Rounded-rect path with radii [tl, tr, br, bl] clamped to the box. Chamfer style replaces each
 * corner arc with a straight 45° cut of the same tangent length.
 */
export function roundedRectPath(
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
  return `${d}Z`
}

/**
 * Merge staging cell edits into a scratch copy of the buffer. The scratch is reused across frames:
 * a fresh copy per stroke frame allocates megabytes on large grids (512×512×sub3 ≈ 2.36 M entries)
 * and thrashes the GC mid-stroke.
 */
let mergeScratch: Uint16Array | null = null

export function mergedCells(doc: Doc, staging?: Staging): Uint16Array {
  const s = staging?.cells
  if (!s || s.size === 0) return doc.cells
  let c = mergeScratch
  if (!c || c.length !== doc.cells.length) c = mergeScratch = new Uint16Array(doc.cells.length)
  c.set(doc.cells)
  for (const [i, v] of s) c[i] = v === null ? 0 : v
  return c
}

/* ---------------------------------- shape mode ---------------------------------- */

/** End index (exclusive) of the same-value run starting at `row + bx`. */
function runEnd(cells: Uint16Array, row: number, bx: number, bound: number, v: number): number {
  let end = bx + 1
  while (end < bound && cells[row + end] === v) end++
  return end
}

/** Order: [tl, tr, br, bl]. Zero the corners whose sides face the canvas border. */
export const borderRadii = (
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

/** Shared context for texture-hole anchors (fixed for the whole shapeGeometry scan). */
interface TexCellCtx {
  texCells: Map<number, TextureCell[]>
  /** Per-value region digest for the texture fragment cache (seeded with the style signature). */
  digests: Map<number, number>
  seed: number
  cells: Uint16Array
  bw: number
  bh: number
  cw: number
  ch: number
  chamfer: boolean
  sub: number
}

/** One texture-hole anchor: the cell's figure box, corner style and same-value connectivity. */
function pushTextureCell(
  ctx: TexCellCtx,
  v: number,
  bx: number,
  by: number,
  radii: number[],
): void {
  const { cells, bw, bh, cw, ch, chamfer, sub } = ctx
  const same = (xx: number, yy: number) =>
    xx >= 0 && yy >= 0 && xx < bw && yy < bh && cells[yy * bw + xx] === v
  let list = ctx.texCells.get(v)
  if (!list) ctx.texCells.set(v, (list = []))
  const connectedL = same(bx - 1, by)
  const connectedT = same(bx, by - 1)
  const connectedR = same(bx + 1, by)
  const connectedB = same(bx, by + 1)
  list.push({
    x: bx / sub + (1 / sub - cw) / 2,
    y: by / sub + (1 / sub - ch) / 2,
    w: cw,
    h: ch,
    radii,
    chamfer,
    cx0: bx / sub,
    cy0: by / sub,
    cx1: (bx + 1) / sub,
    cy1: (by + 1) / sub,
    connectedL,
    connectedT,
    connectedR,
    connectedB,
  })
  // integer digest of the region layout: position, connectivity, corner-radii pattern
  const flags =
    (connectedL ? 1 : 0) | (connectedT ? 2 : 0) | (connectedR ? 4 : 0) | (connectedB ? 8 : 0)
  const radiiBits =
    Number(radii[0] !== 0) |
    (Number(radii[1] !== 0) << 1) |
    (Number(radii[2] !== 0) << 2) |
    (Number(radii[3] !== 0) << 3)
  let acc = ctx.digests.get(v) ?? ctx.seed
  acc = fnvWord(fnvWord(fnvWord(acc, bx), by), flags | (radiiBits << 4))
  ctx.digests.set(v, acc)
}

/**
 * Per-color texture hole fragments into the path groups. Figure-level gaps hug the silhouette of
 * every color, so their cache digest mixes all regions (otherwise each color digest stands alone).
 */
function emitTextureHoles(
  texCells: Map<number, TextureCell[]>,
  digests: Map<number, number>,
  texSeed: number,
  tex: TextureSettings,
  sub: number,
  groups: Map<number, string[]>,
): void {
  let fig: FigureSpace | undefined
  if (tex.gapMode === 'figure') {
    const all: TextureCell[] = []
    for (const list of texCells.values()) {
      for (const c of list) all.push(c)
    }
    fig = figureSpace(all, sub)
  }
  let figSeed: number | undefined
  if (fig) {
    figSeed = texSeed
    for (const [v] of texCells) figSeed = fnvWord(fnvWord(figSeed, v), digests.get(v) ?? texSeed)
  }
  for (const [v, list] of texCells) {
    const holes = regionTextureFragments(
      list,
      tex,
      v,
      fig,
      fig ? figSeed : (digests.get(v) ?? texSeed),
    )
    if (holes) {
      const frags = groups.get(v)
      if (frags) frags.push(holes)
    }
  }
}

/** Buffer-cell bounds of a tile-scoped scan (exclusive end); whole buffer when omitted. */
export interface TileRange {
  bx0: number
  by0: number
  bx1: number
  by1: number
}

/**
 * Pixels-mode geometry of one document buffer: horizontal runs of same-value cells collapse into
 * one rect fragment when every per-cell fragment would be a plain square (the run-merge fast path),
 * otherwise each cell emits its own fragment. `tile` restricts the scan to a buffer-cell rectangle
 * — the dirty-tile geometry cache rebuilds only changed tiles this way (runs crossing the tile edge
 * split into per-tile fragments; the union across tiles renders identically).
 */
export function shapeGeometry(
  doc: Doc,
  cells: Uint16Array,
  links: readonly Link[],
  tile?: TileRange,
): Geometry {
  const bw = bufferWidth(doc)
  const bh = bufferHeight(doc)
  const bx0 = tile ? tile.bx0 : 0
  const bx1 = tile ? tile.bx1 : bw
  const by0 = tile ? tile.by0 : 0
  const by1 = tile ? tile.by1 : bh
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
  const shape = doc.style.shape
  const sp = doc.style.shapeParams
  const toneSize = doc.style.toneSize
  const toneSizeMin = doc.style.toneSizeMin
  // tone-scale lookup per palette value: darker ink draws a larger figure
  const toneOf = new Map<number, number>()
  const toneScaleOf = (v: number): number => {
    let k = toneOf.get(v)
    if (k === undefined) {
      k = toneScale(cellColor(doc, v) ?? '#ffffff', toneSizeMin)
      toneOf.set(v, k)
    }
    return k
  }
  // unrotated square keeps every classic fast path: run merging and rect-shaped texture holes
  // (angle jitter rotates per cell, so it leaves the plain-rect path like a base rotation)
  const plainSquare = shape === 'square' && sp.rotation === 0 && doc.style.angleJitter === 0
  const jitterOn = hasJitter(doc.style)
  const tex = doc.texture
  // texture holes are punched as evenodd subpaths of the cell rect — on rotated or non-square
  // forms they would paint specks outside the ink, so baked texture stays a plain-square feature
  // (shrunk-by-jitter figures excluded for the same reason)
  const textured = tex.effect !== 'none' && plainSquare && !toneSize && doc.style.sizeJitter === 0
  // texture is one continuous pattern per color: sides shared with the same
  // value stay connected (no seams), open sides carry the gap margin.
  // Tile-scoped scans exclude texture at the caller (the tile cache only runs on untextured
  // docs) — a tile-local region would place specks differently than the whole-doc pattern.
  const texCells = textured && !tile ? new Map<number, TextureCell[]>() : undefined
  // digest seed: every style input of the texture holes beyond the per-cell layout
  let texSeed = FNV_OFFSET
  for (const r of radii) texSeed = fnvFloat(texSeed, r)
  texSeed = fnvFloat(texSeed, cw)
  texSeed = fnvFloat(texSeed, ch)
  if (chamfer) texSeed = fnvWord(texSeed, 1)
  texSeed = fnvWord(texSeed, doc.sub)
  const digests = textured ? new Map<number, number>() : undefined
  const texCtx: TexCellCtx | null =
    texCells && digests
      ? { texCells, digests, seed: texSeed, cells, bw, bh, cw, ch, chamfer, sub: doc.sub }
      : null

  const groups = new Map<number, string[]>()
  // Horizontal runs of same-value cells collapse into one rect fragment when every per-cell
  // fragment would be a plain square (zero radii, no texture, no size scaling, no cell form or
  // rotation, no tone-driven size): classic pixel-art ink then builds orders of magnitude fewer
  // path fragments. Any rounding, texture effect, sizeX/sizeY scaling or non-square form keeps
  // the exact per-cell loop — fragments stop being plain rects there.
  const runMerge =
    !textured &&
    radii.every((r) => r === 0) &&
    doc.style.sizeX === 1 &&
    doc.style.sizeY === 1 &&
    plainSquare &&
    !toneSize &&
    !jitterOn
  // one cell fragment: tone-scaled box, then the rect or form path, then texture bookkeeping
  const pushCell = (v: number, bx: number, by: number, end: number) => {
    let x = bx / doc.sub + (1 / doc.sub - cw) / 2
    let y = by / doc.sub + (1 / doc.sub - ch) / 2
    let w = (end - bx) * cw
    let h = ch
    if (toneSize) {
      // the figure shrinks with its color's lightness: dark = full cell, light = toneSizeMin
      const k = toneScaleOf(v)
      w = cw * k
      h = ch * k
      x = bx / doc.sub + (1 / doc.sub - w) / 2
      y = by / doc.sub + (1 / doc.sub - h) / 2
    }
    let spHere = sp
    let shrink = 1
    if (jitterOn) {
      // deterministic per-cell size/angle variation (never on merged runs: runMerge is off)
      const j = jitterAt(doc.style, by * bw + bx, bw)
      shrink = j.size
      const w2 = w * shrink
      const h2 = h * shrink
      x = bx / doc.sub + (1 / doc.sub - w2) / 2
      y = by / doc.sub + (1 / doc.sub - h2) / 2
      w = w2
      h = h2
      if (j.angle !== 0) spHere = { ...sp, rotation: (sp.rotation + j.angle + 360) % 360 }
    }
    const onBorder = squareEdges && (bx === 0 || by === 0 || bx === bw - 1 || by === bh - 1)
    const radiiHere =
      runMerge || !onBorder
        ? radii
        : borderRadii(radii, bx === 0, by === 0, bx === bw - 1, by === bh - 1)
    const scaledRadii =
      shrink === 1 ? radiiHere : radiiHere.map((r) => Math.min(0.5 * Math.min(w, h), r * shrink))
    let frags = groups.get(v)
    if (!frags) groups.set(v, (frags = []))
    frags.push(
      plainSquare
        ? roundedRectPath(x, y, w, h, scaledRadii, chamfer)
        : cellShapeFragment({
            id: shape,
            x,
            y,
            w,
            h,
            params: spHere,
            radius: doc.style.radius,
            chamfer,
          }),
    )
    if (texCells && texCtx) {
      pushTextureCell(texCtx, v, bx, by, radiiHere)
    }
  }
  for (let by = by0; by < by1; by++) {
    const row = by * bw
    for (let bx = bx0; bx < bx1;) {
      const v = cells[row + bx]
      if (v === 0) {
        bx++
        continue
      }
      const end = runMerge ? runEnd(cells, row, bx, bx1, v) : bx + 1
      pushCell(v, bx, by, end)
      bx = end
    }
  }
  if (texCells && digests && texCtx) {
    emitTextureHoles(texCells, digests, texSeed, tex, doc.sub, groups)
  }

  const paths: StyledPath[] = []
  for (const [v, frags] of groups) {
    paths.push({ d: frags.join(''), fill: cellColor(doc, v) ?? '#888' })
  }
  paths.push(...linkStrokePaths(doc, links))
  return { paths }
}

/** Capsule strokes for connectors, grouped per color (shared by the whole-doc and tile paths). */
export function linkStrokePaths(doc: Doc, links: readonly Link[]): StyledPath[] {
  if (links.length === 0) return []
  const byColor = new Map<number, string[]>()
  for (const l of links) {
    let frags = byColor.get(l.v)
    if (!frags) byColor.set(l.v, (frags = []))
    frags.push(`M${fmt(l.ax + 0.5)} ${fmt(l.ay + 0.5)}L${fmt(l.bx + 0.5)} ${fmt(l.by + 0.5)}`)
  }
  const paths: StyledPath[] = []
  for (const [v, frags] of byColor) {
    paths.push({
      d: frags.join(''),
      stroke: cellColor(doc, v) ?? '#888',
      strokeWidth: doc.connectorWidth,
    })
  }
  return paths
}
