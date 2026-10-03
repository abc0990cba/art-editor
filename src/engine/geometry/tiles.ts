import { elementFromDoc } from '../core/doc-style.ts'
import { bufferHeight, bufferWidth, type Doc } from '../core/doc.ts'
import { visibleObjs, type SceneLayer } from '../core/scene.ts'
import { hasJitter } from '../effects/jitter.ts'
import { isPlainSquare } from '../grids/index.ts'
import { elementStyleKey } from './elements.ts'
import { buildGeometry, type Geometry, type StyledPath } from './index.ts'
import { linkStrokePaths, shapeGeometry, type TileRange } from './shape.ts'

/**
 * Dirty-tile geometry cache — the pixels-mode commit lever. A local edit rebuilds only the tiles
 * its changed cells fall into: O(changed tiles) fragment emission instead of a whole-canvas scan,
 * which is the 4096² commit's dominant cost (whole rebuild ≈ 92–460 ms; the tile spike measured 4
 * dirty tiles of a 2048² canvas at ~5 ms).
 *
 * Fresh tiles reuse the previous document's cached fragment strings, so the per-color merged paths
 * that reach `drawGeometry` keep hitting the Path2D string cache — the art bitmap repaint stays a
 * cheap raster of cached paths. Runs crossing a tile border split into per-tile fragments; the
 * union across tiles is geometry-identical to the whole-doc scan (shared rect edges render
 * seam-free), and every other render path (texture, element scope, multi-layer, outline, metaball,
 * non-square grids) falls back to the whole-doc builder unchanged.
 */

/** Buffer cells per tile side (matches the tile-spike granularity: 4096² → 256 tiles). */
const TILE = 256

interface TileEntry {
  /** Doc-level signature the tile fragments were built under (dims, palette, style). */
  sig: string
  /** Fragment paths of one tile; null = dirty (needs a rebuild). */
  tiles: (StyledPath[] | null)[]
  /** Tile columns (row-major indexing). */
  tCols: number
  geometry: Geometry
}

const cache = new WeakMap<Doc, TileEntry>()

const NO_LINKS: readonly [] = []

/**
 * Geometry for a committed document, rebuilding only the tiles whose cells changed since `prevDoc`.
 * Ineligible documents (anything but the plain global-scope pixels path with one visible layer)
 * build wholly — identical output, today's cost.
 */
export function ensureTileGeometry(prevDoc: Doc | null, doc: Doc): Geometry {
  const hit = cache.get(doc)
  if (hit) return hit.geometry
  if (!tileEligible(doc)) {
    const geometry = buildGeometry(doc)
    cache.set(doc, { sig: '', tiles: [], tCols: 0, geometry })
    return geometry
  }
  const prev = prevDoc && cache.get(prevDoc)
  const sig = docSig(doc)
  const bw = bufferWidth(doc)
  const bh = bufferHeight(doc)
  const tCols = Math.ceil(bw / TILE)
  const tRows = Math.ceil(bh / TILE)
  let tiles: (StyledPath[] | null)[]
  if (prev && prevDoc && prev.sig === sig && prev.tiles.length === tCols * tRows) {
    tiles = prev.tiles.slice()
    markDirty(doc.cells, prevDoc.cells, tiles, tCols, bw)
  } else {
    tiles = new Array<StyledPath[] | null>(tCols * tRows).fill(null)
  }
  for (let ty = 0; ty < tRows; ty++) {
    for (let tx = 0; tx < tCols; tx++) {
      const idx = ty * tCols + tx
      if (tiles[idx]) continue
      const range: TileRange = {
        bx0: tx * TILE,
        by0: ty * TILE,
        bx1: Math.min((tx + 1) * TILE, bw),
        by1: Math.min((ty + 1) * TILE, bh),
      }
      // per-tile ink only: links are drawn once for the whole document below
      tiles[idx] = shapeGeometry(doc, doc.cells, NO_LINKS, range).paths
    }
  }
  // per-tile paths go to the raster as-is: tiles never overlap, so filling them separately is
  // pixel-identical to the merged whole-document path — and skipping the merge keeps commits off
  // a whole-geometry string concatenation (the per-tile strings stay in the Path2D cache)
  const paths: StyledPath[] = []
  for (const frags of tiles) {
    for (const p of frags!) paths.push(p)
  }
  paths.push(...linkStrokePaths(doc, doc.links))
  const geometry: Geometry = { paths }
  cache.set(doc, { sig, tiles, tCols, geometry })
  return geometry
}

/**
 * The plain pixel path the tile cache covers: square unrotated grid, pixels mode, no baked texture
 * / jitter / tone size, single visible layer (the composite `doc.cells` then IS that layer's
 * buffer). Global scope renders every cell with the doc style; element scope qualifies when every
 * visible object froze exactly the doc-level style — the per-element geometry then equals the
 * doc-style geometry. Everything else keeps the whole-doc builder.
 */
function tileEligible(doc: Doc): boolean {
  const docKey = elementStyleKey(elementFromDoc(doc))
  if (doc.layers) {
    let visible: SceneLayer | undefined
    for (const layer of doc.layers) {
      if (!layer.visible) continue
      if (visible) return false
      visible = layer
    }
    if (!visible) return false
    for (const o of visibleObjs(visible)) {
      if (o.links.length > 0) return false
      if (doc.styleScope === 'element' && elementStyleKey(o.style) !== docKey) return false
    }
  } else if (doc.styleScope !== 'global') {
    // flat element-scope docs: ownership lives in cellObj, checking it costs a full scan
    return false
  }
  if (!isPlainSquare(doc)) return false
  if (doc.renderMode !== 'pixels') return false
  if (doc.texture.effect !== 'none') return false
  if (doc.style.toneSize) return false
  if (hasJitter(doc.style)) return false
  return true
}

/** Doc-level inputs the tile fragments depend on beyond the cell buffers. */
function docSig(doc: Doc): string {
  return [
    bufferWidth(doc),
    bufferHeight(doc),
    doc.sub,
    doc.styleScope,
    doc.renderMode,
    doc.connectorWidth,
    doc.palette.join(),
    elementStyleKey(elementFromDoc(doc)),
  ].join('|')
}

/** Drop every tile that contains at least one changed cell (uint32-chunked diff pass). */
function markDirty(
  cells: Uint16Array,
  prev: Uint16Array,
  tiles: (StyledPath[] | null)[],
  tCols: number,
  bw: number,
): void {
  const n = Math.min(cells.length, prev.length)
  const even = n & ~1
  const a = new Uint32Array(cells.buffer, 0, even >> 1)
  const b = new Uint32Array(prev.buffer, 0, even >> 1)
  const drop = (i: number): void => {
    const gx = i % bw
    const gy = (i - gx) / bw
    tiles[((gy / TILE) | 0) * tCols + ((gx / TILE) | 0)] = null
  }
  for (let k = 0; k < a.length; k++) {
    if (a[k] !== b[k]) {
      const i = k << 1
      drop(i)
      if (i + 1 < n) drop(i + 1)
    }
  }
  if (n > even && cells[even] !== prev[even]) drop(even)
}
