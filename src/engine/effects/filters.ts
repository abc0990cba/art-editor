/**
 * The generative filter family: six auto-filters that regenerate the selection's ink instead of
 * reshaping it — gooey (blobify / smoothen), figures (figurefy / patternize), organic (drip /
 * dissolve). This module is the contract the store and UI consume: the op union, the merged params +
 * defaults (the morpho pattern — one interface, ops read their own fields), the chip option lists,
 * and the `filterInk` dispatcher over the three engine modules. Every op is deterministic,
 * integer-exact and palette-preserving.
 */

import type { FillPatternId } from '../texture/fill-data.ts'
import {
  figurefyInk,
  patternizeInk,
  type FigurefyParams,
  type PatternizeParams,
} from './figures.ts'
import { blobifyInk, smoothenInk, type BlobifyParams, type SmoothenParams } from './gooey.ts'
import { dissolveInk, dripInk, type DissolveParams, type DripParams } from './organic.ts'
import type { CellBox, InkCell } from './selection-xform.ts'

/** One-click generative filters offered by the selection menu. */
export type FilterOp = 'blobify' | 'smoothen' | 'figurefy' | 'patternize' | 'drip' | 'dissolve'

/** Ops that open the live-preview popover (interacting continuous params). */
export const FILTER_POPOVER_OPS: readonly FilterOp[] = ['blobify', 'figurefy', 'patternize']

/** Structured patterns exposed to patternize (the dither-threshold families stay a fill tool). */
export const FILTER_PATTERNS: readonly FillPatternId[] = [
  'dots',
  'checker',
  'grid',
  'hatch',
  'stripes-h',
  'stripes-v',
  'stripes-diag',
  'bricks',
  'rings',
  'zigzag',
]

/** Merged params of all six filters; each op reads its own fields. */
export interface FilterParams
  extends
    BlobifyParams,
    SmoothenParams,
    FigurefyParams,
    PatternizeParams,
    DripParams,
    DissolveParams {}

export const DEFAULT_FILTER_PARAMS: FilterParams = {
  radius: 3,
  iso: 0.5,
  falloff: 'smooth',
  passes: 1,
  scale: 3,
  figure: 'circle',
  mode: 'figure',
  pattern: 'dots',
  density: 0.5,
  invert: false,
  dx: 0,
  dy: 1,
  length: 6,
  variation: 0.4,
  amount: 0.5,
  seed: 0,
}

/**
 * Apply one generative filter to an ink snapshot. Every op returns the complete replacement ink
 * (shrinking ops return the surviving subset), ready for the usual selection bake.
 */
export function filterInk(
  op: FilterOp,
  src: Map<number, InkCell>,
  p: FilterParams,
  space: { box: CellBox; bw: number; bh: number },
): Map<number, InkCell> {
  const { box, bw, bh } = space
  switch (op) {
    case 'blobify': {
      return blobifyInk(src, p, bw, bh)
    }
    case 'smoothen': {
      return smoothenInk(src, p.passes, bw, bh)
    }
    case 'figurefy': {
      return figurefyInk(src, p, box, bw, bh)
    }
    case 'patternize': {
      return patternizeInk(src, p, bw)
    }
    case 'drip': {
      return dripInk(src, p, bw, bh)
    }
    case 'dissolve': {
      return dissolveInk(src, p, bw)
    }
  }
}
