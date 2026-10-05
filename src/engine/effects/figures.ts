/**
 * Figure filters on ink maps — regenerating ink instead of reshaping it. `figurefyInk` turns every
 * source cell into a k×k block anchored at the selection box origin whose sub-cells are inked where
 * the cell-shapes hit test places the chosen figure (or everywhere but the figure in cut mode).
 * `patternizeInk` re-masks the ink through the fill-pattern engine, so a silhouette turns into
 * dots, checker, hatch and friends. Both inherit value + owner from the source cell and are
 * deterministic and integer-exact.
 */

import { cellShapeHit, DEFAULT_SHAPE_PARAMS, type CellShapeId } from '../cell-shapes/index.ts'
import type { FillPatternId } from '../texture/fill-data.ts'
import { patternAt } from '../texture/fill-patterns.ts'
import type { CellBox, InkCell } from './selection-xform.ts'

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Figurefy knobs. */
export interface FigurefyParams {
  /** Block edge each source cell expands to (2..6) */
  scale: number
  /** Figure inscribed into every block */
  figure: CellShapeId
  /** `figure` keeps the hit sub-cells, `cut` keeps everything but them */
  mode: 'figure' | 'cut'
}

/**
 * "A figure inside every pixel": each source cell becomes a scale×scale block at `(x − box.x0) ·
 * scale + box.x0` (so the mosaic grows down-right and clips at the buffer edge); sub-cell centers
 * sample the figure's hit test with the default shape params. Returns the complete replacement
 * ink.
 */
export function figurefyInk(
  src: Map<number, InkCell>,
  p: FigurefyParams,
  box: CellBox,
  bw: number,
  bh: number,
): Map<number, InkCell> {
  const k = clamp(Math.round(p.scale), 2, 6)
  const out = new Map<number, InkCell>()
  for (const [i, cell] of src) {
    const x = i % bw
    const y = (i - x) / bw
    const bx = box.x0 + (x - box.x0) * k
    const by = box.y0 + (y - box.y0) * k
    for (let sy = 0; sy < k; sy++) {
      for (let sx = 0; sx < k; sx++) {
        const tx = bx + sx
        const ty = by + sy
        if (tx < 0 || ty < 0 || tx >= bw || ty >= bh) continue
        const hit = cellShapeHit(p.figure, (sx + 0.5) / k, (sy + 0.5) / k, DEFAULT_SHAPE_PARAMS)
        if (p.mode === 'figure' ? hit : !hit) out.set(ty * bw + tx, cell)
      }
    }
  }
  return out
}

/** Patternize knobs. */
export interface PatternizeParams {
  /** Structured fill pattern re-masking the ink */
  pattern: FillPatternId
  /** Pattern tile multiplier (1..8) */
  scale: number
  /** Pattern threshold, 0..1 */
  density: number
  /** Keep cells where the pattern is off instead */
  invert: boolean
}

/**
 * Re-mask the ink with a fill pattern at the cells' absolute buffer coordinates (patterns flow
 * continuously across selections, matching fill behavior). Returns the surviving subset.
 */
export function patternizeInk(
  src: Map<number, InkCell>,
  p: PatternizeParams,
  bw: number,
): Map<number, InkCell> {
  const t = clamp(p.density, 0, 1)
  const scale = clamp(Math.round(p.scale), 1, 8)
  const out = new Map<number, InkCell>()
  for (const [i, cell] of src) {
    const x = i % bw
    const y = (i - x) / bw
    let keep = patternAt(p.pattern, x, y, t, { scale })
    if (p.invert) keep = !keep
    if (keep) out.set(i, cell)
  }
  return out
}
