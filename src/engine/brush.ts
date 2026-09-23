/**
 * Brush model: a pixel size (the tip grid dimension, in buffer cells) plus an on/off tip
 * pattern. A full square pattern of size N paints exactly an N×N block of cells, so the
 * brush size *is* the pixel size the user draws with (5 = "5-cell pixel"). Pure data, no React.
 */

export const MIN_BRUSH = 1
export const MAX_BRUSH = 16

export interface Brush {
  /** tip grid dimension in cells: a full pattern paints size×size cells */
  size: number
  /** row-major, length size*size; true = this tip cell paints */
  pattern: boolean[]
}

export function clampBrushSize(size: unknown): number {
  const n = Math.round(Number(size))
  if (!Number.isFinite(n)) return MIN_BRUSH
  return Math.max(MIN_BRUSH, Math.min(MAX_BRUSH, n))
}

export function squareBrush(size: number): Brush {
  const s = clampBrushSize(size)
  return { size: s, pattern: Array.from({ length: s * s }, () => true) }
}

export function circleBrush(size: number): Brush {
  const s = clampBrushSize(size)
  const c = (s - 1) / 2
  const pattern: boolean[] = []
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) pattern.push(Math.hypot(x - c, y - c) <= c + 0.25)
  return normalizeBrush({ size: s, pattern })
}

export function diamondBrush(size: number): Brush {
  const s = clampBrushSize(size)
  const c = (s - 1) / 2
  const pattern: boolean[] = []
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) pattern.push(Math.abs(x - c) + Math.abs(y - c) <= c + 0.25)
  return normalizeBrush({ size: s, pattern })
}

export function checkerBrush(size: number): Brush {
  const s = clampBrushSize(size)
  const pattern: boolean[] = []
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) pattern.push((x + y) % 2 === 0)
  return normalizeBrush({ size: s, pattern })
}

/** Coerce arbitrary stored/input data into a valid brush; an all-empty tip falls back to full. */
export function normalizeBrush(brush: Partial<Brush> | null | undefined): Brush {
  const size = clampBrushSize(brush?.size)
  const raw = brush?.pattern
  const pattern: boolean[] = []
  for (let i = 0; i < size * size; i++) pattern.push(Array.isArray(raw) ? raw[i] === true : true)
  if (!pattern.some((v) => v)) return squareBrush(size)
  return { size, pattern }
}

/** Resample the tip to a new size (nearest-neighbor) so custom tips survive resizing. */
export function resizeBrush(brush: Brush, size: number): Brush {
  const src = normalizeBrush(brush)
  const s = clampBrushSize(size)
  if (s === src.size) return src
  const pattern: boolean[] = []
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const sx = Math.min(src.size - 1, Math.floor((x * src.size) / s))
      const sy = Math.min(src.size - 1, Math.floor((y * src.size) / s))
      pattern.push(src.pattern[sy * src.size + sx])
    }
  }
  return normalizeBrush({ size: s, pattern })
}

/** Active tip cells as offsets from the stamp anchor, in scan order. */
export function brushOffsets(brush: Brush): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let y = 0; y < brush.size; y++)
    for (let x = 0; x < brush.size; x++) if (brush.pattern[y * brush.size + x]) out.push([x, y])
  return out
}

/**
 * Top-left cell of the tip for a hovered cell.
 * Snapped: the containing block of the size grid anchored at the canvas origin, so size-N
 * pixels tile perfectly (draw at 1/N scale). Free: the tip is centered under the cursor.
 */
export function brushAnchor(
  cellX: number,
  cellY: number,
  size: number,
  snap: boolean,
): [number, number] {
  if (snap) return [Math.floor(cellX / size) * size, Math.floor(cellY / size) * size]
  const off = Math.floor((size - 1) / 2)
  return [cellX - off, cellY - off]
}

/** Named built-in brushes offered in the brush section (user presets live in IndexedDB). */
export interface BrushDef {
  id: string
  make: () => Brush
}

export const BUILT_IN_BRUSHES: readonly BrushDef[] = [
  { id: 'px1', make: () => squareBrush(1) },
  { id: 'px2', make: () => squareBrush(2) },
  { id: 'px3', make: () => squareBrush(3) },
  { id: 'px4', make: () => squareBrush(4) },
  { id: 'px5', make: () => squareBrush(5) },
  { id: 'px8', make: () => squareBrush(8) },
  { id: 'circle3', make: () => circleBrush(3) },
  { id: 'circle5', make: () => circleBrush(5) },
  { id: 'circle7', make: () => circleBrush(7) },
  { id: 'diamond5', make: () => diamondBrush(5) },
  { id: 'checker4', make: () => checkerBrush(4) },
]
