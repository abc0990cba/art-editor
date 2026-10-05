import type { StyledPath } from '.'
import type { Doc, Link, TextureSettings } from '../core/doc'
import { bufferHeight, bufferWidth, cellColor } from '../core/doc'
import { regionTextureFragments, type TextureCell } from '../texture'
import { figureSpace, type FigureSpace } from '../texture/figure'
import { FNV_OFFSET, fnvFloat, fnvWord } from '../texture/region-index.ts'
import { marchingSquares, type Pt } from './marching-squares.ts'
import { filletPath } from './poly-path.ts'

/**
 * Outline render mode: same-color cells connected by an edge form one silhouette traced exactly
 * along cell edges; every 90° corner of the outline (convex and concave) receives a circular fillet
 * sized by the corner-radius setting. Shared edges stay straight.
 */
export function outlineGeometry(
  doc: Doc,
  cells: Uint16Array,
  links: readonly Link[],
): StyledPath[] {
  const bw = bufferWidth(doc)
  const bh = bufferHeight(doc)

  // per color group, first-appearance order
  const order: number[] = []
  const seen = new Set<number>()
  for (let i = 0; i < cells.length; i++) {
    const v = cells[i]
    if (v !== 0 && !seen.has(v)) {
      seen.add(v)
      order.push(v)
    }
  }

  // figure-level gap: one silhouette space over every color, so the margin hugs the merged
  // outline of the whole picture and internal color borders stay seamless
  const texSeed = outlineTexSeed(doc)
  let fig: FigureSpace | undefined
  let figSeed: number | undefined
  if (doc.texture.effect !== 'none' && doc.texture.gapMode === 'figure') {
    const space = allOutlineCells(doc, cells)
    fig = figureSpace(space.cells, doc.sub)
    figSeed = space.digest
  }

  const paths: StyledPath[] = []
  for (const v of order) {
    // binary field with a zero padding ring: contour follows canvas edges and always closes.
    // with corner connectivity the saddle average (0.5) counts as inside, so corner-touching
    // cells of this group trace as one pinched silhouette
    const joinCorners = doc.connectivity !== 'edge'
    const field = new Float32Array((bw + 2) * (bh + 2))
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        if (cells[y * bw + x] === v) field[(y + 1) * (bw + 2) + (x + 1)] = 1
      }
    }
    const loops = marchingSquares(field, bw + 2, bh + 2, joinCorners ? 0.49 : 0.5)
    const rConvex = doc.style.convexRadius / doc.sub
    const rConcave = doc.style.concaveRadius / doc.sub
    // squareEdges: vertices sitting on the canvas border keep their 90° corner
    const cols = bw / doc.sub
    const rows = bh / doc.sub
    const keepCorner = doc.style.squareEdges
      ? (p: Pt) =>
          Math.abs(p.x) > 1e-6 &&
          Math.abs(p.x - cols) > 1e-6 &&
          Math.abs(p.y) > 1e-6 &&
          Math.abs(p.y - rows) > 1e-6
      : undefined
    let d = roundedOutlinePath(
      loops,
      rConvex,
      rConcave,
      doc.sub,
      doc.style.cornerStyle === 'chamfer',
      keepCorner,
    )
    if (d && doc.texture.effect !== 'none')
      d += cellTextureFragments(doc, cells, v, doc.texture, fig, texSeed, figSeed)
    if (d) paths.push({ d, fill: cellColor(doc, v) ?? '#888' })
    // bridges go on a separate same-color path: inside the silhouette path their area would
    // cancel against the loops under the evenodd rule
    if (joinCorners && doc.connectivity === 'corner-bridge') {
      const bridges = bridgeOverlays(doc, cells, v)
      if (bridges) paths.push({ d: bridges, fill: cellColor(doc, v) ?? '#888' })
    }
  }

  appendLinkStrokes(doc, links, paths)
  return paths
}

/** Capsule strokes for connectors, grouped per color (same look as pixels mode). */
function appendLinkStrokes(doc: Doc, links: readonly Link[], paths: StyledPath[]): void {
  if (links.length === 0) return
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

const fmt = (v: number) => String(Math.round(v * 1000) / 1000)

/** Texture cell record of one painted buffer cell (convex corner fillets included). */
function outlineCell(
  doc: Doc,
  cells: Uint16Array,
  bw: number,
  bh: number,
  x: number,
  y: number,
): TextureCell {
  const v = cells[y * bw + x]
  const isV = (xx: number, yy: number) =>
    xx >= 0 && xx < bw && yy >= 0 && yy < bh && cells[yy * bw + xx] === v
  const rConvex = doc.style.convexRadius / doc.sub
  const cell = 1 / doc.sub
  return {
    x: x / doc.sub,
    y: y / doc.sub,
    w: cell,
    h: cell,
    radii: [
      !isV(x - 1, y) && !isV(x, y - 1) ? rConvex : 0, // tl
      !isV(x + 1, y) && !isV(x, y - 1) ? rConvex : 0, // tr
      !isV(x + 1, y) && !isV(x, y + 1) ? rConvex : 0, // br
      !isV(x - 1, y) && !isV(x, y + 1) ? rConvex : 0, // bl
    ],
    chamfer: doc.style.cornerStyle === 'chamfer',
    cx0: x / doc.sub,
    cy0: y / doc.sub,
    cx1: (x + 1) / doc.sub,
    cy1: (y + 1) / doc.sub,
    connectedL: isV(x - 1, y),
    connectedT: isV(x, y - 1),
    connectedR: isV(x + 1, y),
    connectedB: isV(x, y + 1),
  }
}

/** Texture cells of every painted cell across all colors (figure-silhouette input). */
function allOutlineCells(doc: Doc, cells: Uint16Array): { cells: TextureCell[]; digest: number } {
  const bw = bufferWidth(doc)
  const bh = bufferHeight(doc)
  const list: TextureCell[] = []
  let digest = outlineTexSeed(doc)
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (cells[y * bw + x] !== 0) {
        const c = outlineCell(doc, cells, bw, bh, x, y)
        list.push(c)
        digest = mixOutlineCell(digest, x, y, c)
      }
    }
  }
  return { cells: list, digest }
}

/**
 * Texture hole fragments for one color group, appended into the silhouette's own path. The
 * silhouette covers full cells; the gap margin applies only where a side faces another color or
 * empty space, so same-color regions stay continuous. A cell corner whose two orthogonal neighbors
 * are outside the group is a convex region corner — filleted with the convex radius, so specks get
 * the corner test. Concave fillets arc on the far side of the corner point and never enter this
 * cell's tile, so they need no guard. `figSeed` (the whole-silhouette digest) unlocks the fragment
 * cache in figure mode, where the gap hugs every color's outline.
 */
function cellTextureFragments(
  doc: Doc,
  cells: Uint16Array,
  v: number,
  tex: TextureSettings,
  fig: FigureSpace | undefined,
  seed: number,
  figSeed?: number,
): string {
  const bw = bufferWidth(doc)
  const bh = bufferHeight(doc)
  const list: TextureCell[] = []
  let digest = seed
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (cells[y * bw + x] !== v) continue
      const c = outlineCell(doc, cells, bw, bh, x, y)
      list.push(c)
      digest = mixOutlineCell(digest, x, y, c)
    }
  }
  return regionTextureFragments(list, tex, v, fig, fig ? figSeed : digest)
}

/** Digest seed of the style inputs beyond the per-cell layout (convex fillets, sub-detail). */
function outlineTexSeed(doc: Doc): number {
  let seed = fnvFloat(FNV_OFFSET, doc.style.convexRadius / doc.sub)
  seed = fnvFloat(seed, 1 / doc.sub)
  if (doc.style.cornerStyle === 'chamfer') seed = fnvWord(seed, 1)
  return fnvWord(seed, doc.sub)
}

/** Mix one outline cell's layout into a digest: position, connectivity, fillet pattern. */
function mixOutlineCell(acc: number, x: number, y: number, c: TextureCell): number {
  const flags =
    (c.connectedL ? 1 : 0) |
    (c.connectedT ? 2 : 0) |
    (c.connectedR ? 4 : 0) |
    (c.connectedB ? 8 : 0)
  const radiiBits =
    Number(c.radii[0] !== 0) |
    (Number(c.radii[1] !== 0) << 1) |
    (Number(c.radii[2] !== 0) << 2) |
    (Number(c.radii[3] !== 0) << 3)
  return fnvWord(fnvWord(fnvWord(acc, x), y), flags | (radiiBits << 4))
}

/**
 * Junction-aligned bridge overlays for corner-bridge connectivity: one diamond per junction where
 * two same-value cells touch diagonally and both orthogonal neighbors are empty. The diamond's
 * vertices sit at the midpoints of the four cell edges meeting at the shared corner, so the joint
 * stays inside the cell envelope and is symmetric in every diagonal direction.
 */
function bridgeOverlays(doc: Doc, cells: Uint16Array, v: number): string {
  const bw = bufferWidth(doc)
  const bh = bufferHeight(doc)
  const half = 0.5 / doc.sub // distance from the junction to the surrounding edge midpoints
  const r = doc.style.concaveRadius / doc.sub
  const chamfer = doc.style.cornerStyle === 'chamfer'
  let d = ''
  const junctions: { jx: number; jy: number }[] = []
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (cells[y * bw + x] !== v) continue
      const right = x + 1 < bw ? cells[y * bw + x + 1] : 0
      // ↘ junction: cells (x,y) and (x+1,y+1), orthogonal cells empty
      if (
        x + 1 < bw &&
        y + 1 < bh &&
        cells[(y + 1) * bw + (x + 1)] === v &&
        right === 0 &&
        cells[(y + 1) * bw + x] === 0
      ) {
        junctions.push({ jx: (x + 1) / doc.sub, jy: (y + 1) / doc.sub })
      }
      // ↗ junction: cells (x,y) and (x+1,y-1), orthogonal cells empty
      if (
        x + 1 < bw &&
        y - 1 >= 0 &&
        cells[(y - 1) * bw + (x + 1)] === v &&
        right === 0 &&
        cells[(y - 1) * bw + x] === 0
      ) {
        junctions.push({ jx: (x + 1) / doc.sub, jy: y / doc.sub })
      }
    }
  }
  for (const { jx, jy } of junctions) {
    d += emitFilletPath(
      [
        [
          { x: jx + half, y: jy },
          { x: jx, y: jy + half },
          { x: jx - half, y: jy },
          { x: jx, y: jy - half },
        ],
      ],
      r,
      r,
      chamfer,
    )
  }
  return d
}

/**
 * Shared corner-rounding emitter: converts closed doc-unit loops into one compound path, rounding
 * each corner — outer corners with the convex radius, inner corners with the concave radius — via
 * the tangent fillets of `filletPath` (circular arcs tangent to both edges, or straight 45° cuts in
 * chamfer style). Convexity is decided per loop by majority turn sign; fillets clamp to half of the
 * neighboring edge runs. Vertices turning less than ~10° (collinear splits, arc samples) are passed
 * through unrounded.
 */
export function emitFilletPath(
  loops: Pt[][],
  rCvx: number,
  rCcv: number,
  chamfer: boolean,
  keepCorner?: (p: Pt) => boolean,
): string {
  let d = ''
  for (const raw of loops) {
    d += filletPath(raw, chamfer, (convex) => (convex ? rCvx : rCcv), keepCorner)
  }
  return d
}

/**
 * Build the square-grid outline path: restore true 90° corners from the marching-squares staircase
 * (binary crossings cut corners diagonally), then round via the shared emitter.
 */
function roundedOutlinePath(
  loops: Pt[][],
  rCvx: number,
  rCcv: number,
  sub: number,
  chamfer: boolean,
  keepCorner?: (p: Pt) => boolean,
): string {
  const loopsDoc = loops.map((raw) => simplifyLoop(raw, sub))
  return emitFilletPath(loopsDoc, rCvx, rCcv, chamfer, keepCorner)
}

/**
 * Convert marching-squares loop points to doc units and rebuild the true cell-corner vertices: on a
 * binary field every painted-cell corner is cut by a diagonal segment, so each diagonal is split
 * into two half-cell legs through the corner point.
 */
function simplifyLoop(raw: Pt[], sub: number): Pt[] {
  const expanded: Pt[] = []
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i]
    const b = raw[(i + 1) % raw.length]
    expanded.push(a)
    if (a.x !== b.x && a.y !== b.y) {
      // diagonal: exactly one endpoint lies on a vertical (integer x) marching edge
      expanded.push(Number.isInteger(a.x) ? { x: b.x, y: a.y } : { x: a.x, y: b.y })
    }
  }
  // to doc units; binary crossings make all coordinates exact multiples of 0.5
  const pts = expanded.map((p) => ({ x: (p.x - 0.5) / sub, y: (p.y - 0.5) / sub }))
  // drop consecutive duplicates
  const deduped = pts.filter((p, i) => {
    const last = pts[(i - 1 + pts.length) % pts.length]
    return i === 0 || p.x !== last.x || p.y !== last.y
  })
  // remove collinear middle vertices
  const out: Pt[] = []
  const n = deduped.length
  for (let i = 0; i < n; i++) {
    const a = deduped[(i - 1 + n) % n]
    const b = deduped[i]
    const c = deduped[(i + 1) % n]
    const d1x = b.x - a.x
    const d1y = b.y - a.y
    const d2x = c.x - b.x
    const d2y = c.y - b.y
    if (d1x * d2y - d1y * d2x !== 0) out.push(b)
  }
  return out
}
