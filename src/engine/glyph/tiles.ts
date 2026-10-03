/**
 * User-editable glyph tile sets for tone-mapped dithering — core model.
 *
 * A tile set is a ramp of boolean tiles: `levels[0]` is the empty (white) tile and `levels[N - 1]`
 * is the full (black) tile; every level in between is a free-form, user-editable pattern of w×h
 * cells (row-major, like brush tips). Dithering picks a tile by tone and reads the cell under the
 * repeating tile grid — the classic pattern-image workflow (pixel-art-maker style) with live
 * editing.
 *
 * Procedural ramp generators and the built-in registry live in glyph-generators.ts /
 * glyph-builtins.ts; user sets persist in IndexedDB via storage/glyph-tiles.ts, mirroring the brush
 * preset lifecycle.
 */

import type { OrderedMatrix } from '../dither/matrices.ts'

const MIN_GLYPH_TILE = 1
const MAX_GLYPH_TILE = 16
const MIN_GLYPH_LEVELS = 3
const MAX_GLYPH_LEVELS = 65

/** One tone level: w*h cells, row-major; true = ink. */
export type GlyphTileCells = boolean[]

export interface GlyphTileSet {
  name: string
  /** Tile grid width in cells */
  w: number
  /** Tile grid height in cells */
  h: number
  /** Levels[t] = the tile shown when the pixel tone maps to level t (0 = empty) */
  levels: GlyphTileCells[]
}

function clampGlyphTileSize(size: unknown): number {
  const n = Math.round(Number(size))
  if (!Number.isFinite(n)) return MIN_GLYPH_TILE
  return Math.max(MIN_GLYPH_TILE, Math.min(MAX_GLYPH_TILE, n))
}

function clampGlyphLevels(levels: unknown): number {
  const n = Math.round(Number(levels))
  if (!Number.isFinite(n)) return 9
  return Math.max(MIN_GLYPH_LEVELS, Math.min(MAX_GLYPH_LEVELS, n))
}

/** Fill every level's missing cells with false; invalid entries fall back to the neighbors. */
export function normalizeGlyphTileSet(
  input: Partial<GlyphTileSet> | null | undefined,
): GlyphTileSet {
  const w = clampGlyphTileSize(input?.w)
  const h = clampGlyphTileSize(input?.h)
  // empty/missing levels array = unset → default level count
  const count = clampGlyphLevels(input?.levels?.length || undefined)
  const raw = input?.levels ?? []
  const levels: GlyphTileCells[] = []
  for (let t = 0; t < count; t++) {
    const src = Array.isArray(raw[t]) ? raw[t] : null
    const cells: GlyphTileCells = []
    for (let i = 0; i < w * h; i++) cells.push(src ? src[i] === true : false)
    levels.push(cells)
  }
  // guarantee the ramp ends: empty first level, full last level (unless the user
  // deliberately edited them — only fill when the set has never been touched)
  if (input?.levels === undefined) {
    levels[0] = levels[0].map(() => false)
    levels[count - 1] = levels[count - 1].map(() => true)
  }
  return { name: String(input?.name ?? 'Custom').slice(0, 40), w, h, levels }
}

/** Tone t (0..1) → tile index; t=0 uses the first, t=1 the last level. */
export function tileIndexForTone(t: number, levelCount: number): number {
  const clamped = Math.max(0, Math.min(1, t))
  return Math.min(levelCount - 1, Math.max(0, Math.round(clamped * (levelCount - 1))))
}

/** The cell of the tile selected for tone t, at the repeating tile position (x, y). */
export function glyphCellAt(set: GlyphTileSet, x: number, y: number, t: number): boolean {
  const idx = tileIndexForTone(t, set.levels.length)
  const mx = ((x % set.w) + set.w) % set.w
  const my = ((y % set.h) + set.h) % set.h
  return set.levels[idx][my * set.w + mx] === true
}

/** Ink coverage of one tile (0..1) — used to sort/preview levels and sanity-check ramps. */
export function tileCoverage(cells: GlyphTileCells): number {
  if (cells.length === 0) return 0
  let on = 0
  for (const v of cells) if (v) on++
  return on / cells.length
}

/* ------------------------------ generators ------------------------------ */

/** Empty set with every level blank; the editor fills it. */
export function emptyGlyphSet(
  w: number,
  h: number,
  levels: number,
  name = 'Новый набор',
): GlyphTileSet {
  const set = normalizeGlyphTileSet({
    name,
    w,
    h,
    levels: Array.from({ length: levels }, () => []),
  })
  set.levels[0] = set.levels[0].map(() => false)
  set.levels[levels - 1] = set.levels[levels - 1].map(() => true)
  return set
}

/** Monotone ramp from an ordered matrix: rank order = ink order. */
export function glyphSetFromMatrix(m: OrderedMatrix, name: string): GlyphTileSet {
  const n = m.length
  const cells = n * n
  const levels = cells + 1
  const ranks: number[] = []
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) ranks.push(m[y][x])
  const maxRank = Math.max(...ranks)
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    // -0.5 keeps level 0 empty (rank 0 must wait for the second level)
    const threshold = (t / (levels - 1)) * (maxRank + 1) - 0.5
    levelsOut.push(ranks.map((r) => r < threshold))
  }
  return { name, w: n, h: n, levels: levelsOut }
}

/* ------------------------------ transforms ------------------------------ */

/** Recolor/resample a set to a new tile size via nearest-neighbor. */
export function resizeGlyphSet(set: GlyphTileSet, w: number, h: number): GlyphTileSet {
  const nw = clampGlyphTileSize(w)
  const nh = clampGlyphTileSize(h)
  const levels = set.levels.map((cells) => {
    const out: GlyphTileCells = []
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        const sx = Math.min(set.w - 1, Math.floor((x * set.w) / nw))
        const sy = Math.min(set.h - 1, Math.floor((y * set.h) / nh))
        out.push(cells[sy * set.w + sx] === true)
      }
    }
    return out
  })
  return normalizeGlyphTileSet({ ...set, w: nw, h: nh, levels })
}

/** Flip every cell of every level. */
export function invertGlyphSet(set: GlyphTileSet): GlyphTileSet {
  return {
    ...set,
    levels: set.levels.map((cells) => cells.map((v) => !v)),
  }
}

/** Tone field of a monotone set: the highest inked level at each tile position (0..1). */
export function glyphSetToField(set: GlyphTileSet): (x: number, y: number) => number {
  const levelCount = set.levels.length
  return (x, y) => {
    const mx = ((x % set.w) + set.w) % set.w
    const my = ((y % set.h) + set.h) % set.h
    let best = 0
    for (let t = 0; t < levelCount; t++) {
      if (set.levels[t][my * set.w + mx]) best = t
    }
    return levelCount <= 1 ? 0 : best / (levelCount - 1)
  }
}

/**
 * Sample a horizontal tone ramp through the set for previews: tone falls left (full ink) to right
 * (empty), row-major w×h cells. This is how the gallery and pickers show a set "in use".
 */
export function glyphRampField(set: GlyphTileSet, w: number, h: number): GlyphTileCells {
  const out: GlyphTileCells = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) out.push(glyphCellAt(set, x, y, 1 - x / Math.max(1, w - 1)))
  }
  return out
}
