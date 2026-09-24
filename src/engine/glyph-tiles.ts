/**
 * User-editable glyph tile sets for tone-mapped dithering.
 *
 * A tile set is a ramp of boolean tiles: `levels[0]` is the empty (white) tile and `levels[N - 1]`
 * is the full (black) tile; every level in between is a free-form, user-editable pattern of w×h
 * cells (row-major, like brush tips). Dithering picks a tile by tone and reads the cell under the
 * repeating tile grid — the classic pattern-image workflow (pixel-art-maker style) with live
 * editing.
 *
 * Built-in sets are generated here (from ordered matrices, growing dots, lines); user sets persist
 * in IndexedDB via storage/glyph-tiles.ts and mirror the brush preset lifecycle.
 */

import { BAYER2, BAYER4, BAYER8, type OrderedMatrix } from './dither-matrices.ts'

const MIN_GLYPH_TILE = 1
const MAX_GLYPH_TILE = 8
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

/** Growing dot: each level inks the cells whose center lies inside radius r(t). */
export function glyphSetDots(n: number, levels: number, name = 'Точки'): GlyphTileSet {
  const levelsOut: GlyphTileCells[] = []
  const cx = (n - 1) / 2
  const cy = (n - 1) / 2
  const maxR = Math.hypot(cx + 0.5, cy + 0.5)
  for (let t = 0; t < levels; t++) {
    const r = (t / (levels - 1)) * maxR
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        cells.push(Math.hypot(x - cx, y - cy) <= r + 0.15)
      }
    }
    levelsOut.push(cells)
  }
  return { name, w: n, h: n, levels: levelsOut }
}

/** Straight lines: horizontal, vertical or 45° diagonal; thickness grows with tone. */
export function glyphSetLines(
  dir: 'h' | 'v' | 'diag',
  n: number,
  levels: number,
  name: string,
): GlyphTileSet {
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        let on: boolean
        if (dir === 'h') on = y < Math.round((t / (levels - 1)) * n)
        else if (dir === 'v') on = x < Math.round((t / (levels - 1)) * n)
        else on = (x + y) % n < Math.round((t / (levels - 1)) * n)
        cells.push(on)
      }
    }
    levelsOut.push(cells)
  }
  return { name, w: n, h: n, levels: levelsOut }
}

/** Checkerboard: ink share grows by switching the phase of filled cells. */
export function glyphSetChecker(n: number, levels: number, name = 'Шахматка'): GlyphTileSet {
  const levelsOut: GlyphTileCells[] = []
  const total = n * n
  for (let t = 0; t < levels; t++) {
    const share = t / (levels - 1)
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const phase = (x + y) % 2
        cells.push(phase === 0 ? share > 0 : share > 0.5 ? (x + y * 3) % 3 !== 0 : false)
      }
    }
    // guarantee monotone coverage
    if (tileCoverage(cells) > share + 1 / total) {
      levelsOut.push(levelsOut[levelsOut.length - 1] ?? cells)
    } else {
      levelsOut.push(cells)
    }
  }
  return { name, w: n, h: n, levels: levelsOut }
}

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

/* ------------------------------ built-ins ------------------------------ */

export interface BuiltInGlyphSet {
  id: string
  set: GlyphTileSet
}

export const BUILT_IN_GLYPH_SETS: readonly BuiltInGlyphSet[] = [
  { id: 'glyph-bayer2', set: glyphSetFromMatrix(BAYER2, 'Байер 2×2') },
  { id: 'glyph-bayer4', set: glyphSetFromMatrix(BAYER4, 'Байер 4×4') },
  { id: 'glyph-bayer8', set: glyphSetFromMatrix(BAYER8, 'Байер 8×8') },
  { id: 'glyph-dots4', set: glyphSetDots(4, 17, 'Точки 4×4') },
  { id: 'glyph-dots8', set: glyphSetDots(8, 17, 'Точки 8×8') },
  { id: 'glyph-hlines', set: glyphSetLines('h', 4, 9, 'Линии — горизонталь') },
  { id: 'glyph-vlines', set: glyphSetLines('v', 4, 9, 'Линии — вертикаль') },
  { id: 'glyph-diag', set: glyphSetLines('diag', 4, 9, 'Линии — диагональ') },
  { id: 'glyph-checker', set: glyphSetChecker(4, 9, 'Шахматка') },
]

export function builtInGlyphSetById(id: string): GlyphTileSet | null {
  return BUILT_IN_GLYPH_SETS.find((b) => b.id === id)?.set ?? null
}
