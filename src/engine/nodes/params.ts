/**
 * Canvas-aware parameter bounds for the node editors.
 *
 * Numeric params marked with a `span` measure the canvas in cells, so their editor
 * range should follow the current grid (±15% headroom) instead of the static schema
 * bounds (which only exist as hard clamps for storage). Unmarked params keep their
 * schema bounds unchanged.
 */

import type { NodeParamSpec } from './types'

export interface Bounds {
  min: number
  max: number
}

/** headroom beyond the canvas edge, as a fraction of the canvas dimension */
const PAD = 0.15

const padOf = (dim: number) => Math.ceil(dim * PAD)

const round = (v: number, int: boolean) => (int ? Math.round(v) : Math.round(v * 100) / 100)

/**
 * Effective editor bounds for a numeric param on a `cols × rows` grid. Always
 * intersects the canvas-derived range with the schema's hard clamp and never inverts,
 * so sliders stay sane on any canvas size.
 */
export function paramBounds(
  spec: NodeParamSpec,
  grid: { cols: number; rows: number },
): Bounds | null {
  if (spec.kind !== 'number' && spec.kind !== 'int') return null
  const hard: Bounds = { min: spec.min, max: spec.max }
  const int = spec.kind === 'int'
  if (!spec.span) return hard
  const maxDim = Math.max(grid.cols, grid.rows)
  let lo: number
  let hi: number
  switch (spec.span) {
    case 'x':
      lo = -padOf(grid.cols)
      hi = grid.cols + padOf(grid.cols)
      break
    case 'y':
      lo = -padOf(grid.rows)
      hi = grid.rows + padOf(grid.rows)
      break
    case 'size':
      lo = spec.min
      hi = maxDim + padOf(maxDim)
      break
    case 'delta':
      lo = -(maxDim + padOf(maxDim))
      hi = maxDim + padOf(maxDim)
      break
  }
  return {
    min: round(Math.max(hard.min, Math.min(lo, hi)), int),
    max: round(Math.min(hard.max, Math.max(lo, hi)), int),
  }
}

/**
 * Editor bounds extended to include the stored value: a graph written on a bigger
 * canvas must still display its real numbers when the canvas shrank, instead of a
 * pinned slider lying about the value.
 */
export function boundsWithValue(b: Bounds, value: number): Bounds {
  return { min: Math.min(b.min, value), max: Math.max(b.max, value) }
}
