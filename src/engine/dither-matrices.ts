/**
 * Ordered-dither threshold matrices shared by the fill-pattern library and the image-import
 * dithering pipeline. Every matrix is stored in the canonical rank convention (0 = the first
 * threshold to flip, so low ranks map to dark tones) and read through thresholdAt() into a 0..1
 * comparison value: a pixel tone t picks the second palette color when t > thresholdAt(x, y).
 */

/** Row-major rank matrix (0 = first threshold to flip). */
export type OrderedMatrix = readonly (readonly number[])[]

export const BAYER2 = [
  [0, 2],
  [3, 1],
]

function expandBayer(prev: readonly (readonly number[])[]): number[][] {
  const s = prev.length
  const out: number[][] = []
  for (let y = 0; y < s * 2; y++) {
    const row: number[] = []
    for (let x = 0; x < s * 2; x++) {
      row.push(prev[y % s][x % s] * 4 + BAYER2[Math.floor(y / s)][Math.floor(x / s)])
    }
    out.push(row)
  }
  return out
}

export const BAYER4 = expandBayer(BAYER2)
export const BAYER8 = expandBayer(BAYER4)
export const BAYER16 = expandBayer(BAYER8)
export const BAYER32 = expandBayer(BAYER16)

/**
 * Rank cells of an n×n tile by a spot function (toroidal distance to the nearest dot center):
 * ascending spot value = the order ink appears as tone darkens. `spot(x, y, dx, dy)` receives the
 * wrapped offsets to the nearest center and returns a comparable number.
 */
function screenRanks(
  n: number,
  centers: readonly (readonly [number, number])[],
  spot: (dx: number, dy: number) => number,
): number[][] {
  const wrapped = (d: number): number => {
    const m = ((d % n) + n) % n
    return Math.min(m, n - m)
  }
  const cells: { x: number; y: number; v: number }[] = []
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let best = Infinity
      for (const [cx, cy] of centers) {
        const dx = wrapped(x - cx)
        const dy = wrapped(y - cy)
        const v = spot(dx, dy)
        if (v < best) best = v
      }
      cells.push({ x, y, v: best })
    }
  }
  cells.sort((a, b) => a.v - b.v || a.y - b.y || a.x - b.x)
  const out: number[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => 0))
  cells.forEach((c, rank) => {
    out[c.y][c.x] = rank
  })
  return out
}

/** Binary pattern → ranks: ink cells take ranks 0..k-1 in scan order, the rest follow. */
function patternRanks(rows: readonly (readonly number[])[]): number[][] {
  const n = rows.length
  let ink = 0
  for (const row of rows) for (const v of row) ink += v
  const out: number[][] = rows.map((row) => row.slice())
  let lo = 0
  let hi = ink
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) out[y][x] = rows[y][x] ? lo++ : hi++
  }
  return out
}

const DOT_CENTERS: readonly (readonly [number, number])[] = [
  [2, 2],
  [6, 6],
]

/** 8×8 rosette screen — round dots growing along the 45° print-screen diagonal. */
export const ROSETTE8 = screenRanks(8, DOT_CENTERS, (dx, dy) => Math.hypot(dx, dy))

/** 8×8 elliptical screen — dots elongated across the diagonal, the chain-like print look. */
export const ELLIPTICAL8 = screenRanks(
  8,
  DOT_CENTERS,
  (dx, dy) => (dx - dy) * (dx - dy) * 4 + (dx + dy) * (dx + dy),
)

/** 8×8 Euclidean screen — square-shouldered dot growth, dots linking into checker lattices. */
export const EUCLIDEAN8 = screenRanks(
  8,
  DOT_CENTERS,
  (dx, dy) => Math.max(dx, dy) + 0.3 * Math.min(dx, dy),
)

/** 8×8 basket weave — 2×2 checker blocks, the coarse textile binding. */
export const WEAVE8 = patternRanks(
  Array.from({ length: 8 }, (_row, y) =>
    Array.from({ length: 8 }, (_cell, x) => (((x >> 1) + (y >> 1)) % 2 === 0 ? 1 : 0)),
  ),
)

/** 8×8 two-up-two-down twill — the denim diagonal ribs. */
export const TWILL8 = patternRanks(
  Array.from({ length: 8 }, (_row, y) =>
    Array.from({ length: 8 }, (_cell, x) => ((((x - y) % 8) + 8) % 8 < 2 ? 1 : 0)),
  ),
)

/** 8×8 houndstooth — 2/2 twill in a 4-and-4 color sequence, the pied-de-poule classic. */
const HOUNDSTOOTH_PATTERN: readonly (readonly number[])[] = [
  [1, 1, 0, 0, 1, 1, 0, 0],
  [1, 1, 0, 0, 1, 1, 0, 0],
  [0, 1, 1, 0, 0, 1, 1, 0],
  [0, 1, 1, 0, 0, 1, 1, 0],
  [0, 0, 1, 1, 0, 0, 1, 1],
  [0, 0, 1, 1, 0, 0, 1, 1],
  [1, 0, 0, 1, 1, 0, 0, 1],
  [1, 0, 0, 1, 1, 0, 0, 1],
]
export const HOUNDSTOOTH8 = patternRanks(HOUNDSTOOTH_PATTERN)

/** 4×4 clustered-dot spiral — ink-growth order of a print screen. */
export const CLUSTER4 = [
  [12, 5, 6, 13],
  [4, 0, 1, 7],
  [11, 3, 2, 8],
  [15, 10, 9, 14],
]

/** 4×4 halftone screen — diamond-shaped ink dots, the newspaper look. */
export const HALFTONE4 = [
  [6, 12, 10, 3],
  [11, 15, 13, 7],
  [9, 14, 5, 1],
  [4, 8, 2, 0],
]

/** 8×8 blue-noise mask — high-frequency aperiodic texture, no visible grid. */
export const BLUE_NOISE8 = [
  [15, 4, 11, 1, 14, 3, 10, 2],
  [6, 13, 8, 15, 5, 12, 7, 9],
  [11, 2, 14, 4, 10, 1, 15, 3],
  [3, 10, 1, 12, 2, 8, 4, 13],
  [13, 7, 9, 6, 14, 5, 11, 1],
  [5, 15, 3, 13, 1, 15, 2, 9],
  [9, 1, 12, 7, 9, 6, 13, 5],
  [1, 8, 5, 14, 4, 11, 7, 12],
]

/** 8×8 void-and-cluster ranks (0..255) — blue-noise character with a finer grain. */
export const VOID_CLUSTER8 = [
  [252, 55, 199, 87, 231, 39, 183, 71],
  [119, 167, 15, 151, 103, 215, 7, 135],
  [207, 79, 239, 31, 191, 63, 247, 95],
  [47, 175, 111, 223, 23, 159, 127, 239],
  [227, 27, 195, 83, 251, 51, 203, 75],
  [91, 211, 3, 139, 115, 187, 19, 147],
  [179, 59, 235, 107, 171, 43, 219, 99],
  [35, 163, 123, 243, 11, 131, 155, 187],
]

/** 8×8 diagonal-line ranks — the classic pattern-dither look of 1-bit art. */
export const PATTERN8 = [
  [0, 4, 8, 12, 16, 20, 24, 28],
  [4, 8, 12, 16, 20, 24, 28, 0],
  [8, 12, 16, 20, 24, 28, 0, 4],
  [12, 16, 20, 24, 28, 0, 4, 8],
  [16, 20, 24, 28, 0, 4, 8, 12],
  [20, 24, 28, 0, 4, 8, 12, 16],
  [24, 28, 0, 4, 8, 12, 16, 20],
  [28, 0, 4, 8, 12, 16, 20, 24],
]

/** Number of distinct threshold levels a matrix spans (for thresholdAt). */

/** Threshold value in [0, 1) at buffer position (x, y) for an n×n matrix. */
export function thresholdAt(
  m: readonly (readonly number[])[],
  n: number,
  levels: number,
  x: number,
  y: number,
): number {
  const mx = ((x % n) + n) % n
  const my = ((y % n) + n) % n
  return (m[my][mx] + 0.5) / levels
}

/** Procedural crosshatch field in [0, 1] — two orthogonal sine waves. */
export function crosshatchAt(x: number, y: number): number {
  const v = (Math.sin(x * 0.5) + Math.sin(y * 0.5)) * 64 + 128
  const t = 1 - v / 255
  return t < 0 ? 0 : t > 1 ? 1 : t
}
