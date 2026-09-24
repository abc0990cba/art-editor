/**
 * Ordered-dither threshold matrices shared by the fill-pattern library and the image-import
 * dithering pipeline. Every matrix is stored in the canonical rank convention (0 = the first
 * threshold to flip, so low ranks map to dark tones) and read through thresholdAt() into a 0..1
 * comparison value: a pixel tone t picks the second palette color when t > thresholdAt(x, y).
 */

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
export const MATRIX_LEVELS: ReadonlyMap<string, number> = new Map([
  ['bayer2', 4],
  ['bayer4', 16],
  ['bayer8', 64],
  ['bayer16', 256],
  ['cluster4', 16],
  ['halftone4', 16],
  ['blue-noise8', 16],
  ['void-cluster8', 256],
  ['pattern8', 32],
])

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
