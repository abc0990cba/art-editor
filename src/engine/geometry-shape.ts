import { cellShapeFragment } from './cell-shapes.ts'
import { toneScale } from './color.ts'
import { bufferHeight, bufferWidth, cellColor, type Doc, type Link } from './doc.ts'
import type { Geometry, Staging, StyledPath } from './geometry-types.ts'
import { hasJitter, jitterAt } from './jitter.ts'
import { figureSpace, type FigureSpace } from './texture-figure.ts'
import { regionTextureFragments, type TextureCell } from './texture.ts'

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
function runEnd(cells: Uint16Array, row: number, bx: number, bw: number, v: number): number {
  let end = bx + 1
  while (end < bw && cells[row + end] === v) end++
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
    connectedL: same(bx - 1, by),
    connectedT: same(bx, by - 1),
    connectedR: same(bx + 1, by),
    connectedB: same(bx, by + 1),
  })
}

export function shapeGeometry(doc: Doc, cells: Uint16Array, links: readonly Link[]): Geometry {
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
  // value stay connected (no seams), open sides carry the gap margin
  const texCells = textured ? new Map<number, TextureCell[]>() : undefined
  const texCtx: TexCellCtx | null = texCells
    ? { texCells, cells, bw, bh, cw, ch, chamfer, sub: doc.sub }
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
  for (let by = 0; by < bh; by++) {
    const row = by * bw
    for (let bx = 0; bx < bw;) {
      const v = cells[row + bx]
      if (v === 0) {
        bx++
        continue
      }
      const end = runMerge ? runEnd(cells, row, bx, bw, v) : bx + 1
      pushCell(v, bx, by, end)
      bx = end
    }
  }
  if (texCells) {
    // figure-level gap: one silhouette space over every color, so the margin hugs the
    // merged outline and internal color borders stay seamless
    let fig: FigureSpace | undefined
    if (tex.gapMode === 'figure') {
      const all: TextureCell[] = []
      for (const list of texCells.values()) {
        for (const c of list) all.push(c)
      }
      fig = figureSpace(all, doc.sub)
    }
    for (const [v, list] of texCells) {
      const holes = regionTextureFragments(list, tex, v, fig)
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
