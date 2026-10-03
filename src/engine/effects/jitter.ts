import type { PixelStyle } from '../core/doc.ts'
import { valueNoise } from '../texture/core.ts'

/* --------------------------------- cell-form jitter --------------------------------- */
/* Deterministic per-cell variation for pixels mode: two smooth value-noise samples over a
   coarse lattice keyed by the cell's grid position, so neighboring cells correlate (organic
   clumping) instead of flickering like white noise. Zero spreads never call into this. */

/** Lattice period in cells: lower = broader clumps. */
const PERIOD = 8

/**
 * Per-cell jitter factors for flat cell index `i` in a grid of stride `stride` (buffer width on the
 * square grid, `cols` on other lattices). `size` multiplies the figure box (1 − spread·noise),
 * `angle` is an absolute degree offset to add.
 */
export function jitterAt(
  style: Pick<PixelStyle, 'sizeJitter' | 'angleJitter' | 'jitterSeed'>,
  i: number,
  stride: number,
): { size: number; angle: number } {
  const gx = i % stride
  const gy = (i - gx) / stride
  const size = 1 - style.sizeJitter * valueNoise(gx / PERIOD, gy / PERIOD, style.jitterSeed)
  const angle =
    style.angleJitter === 0
      ? 0
      : (valueNoise(gx / PERIOD + 37.7, gy / PERIOD + 11.3, style.jitterSeed * 7 + 3) - 0.5) *
        style.angleJitter
  return { size, angle }
}

/** True when any per-cell variation is active (gates the square run-merge fast path). */
export function hasJitter(style: Pick<PixelStyle, 'sizeJitter' | 'angleJitter'>): boolean {
  return style.sizeJitter > 0 || style.angleJitter > 0
}
