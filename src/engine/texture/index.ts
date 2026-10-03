/**
 * Baked vector texture: extra path fragments that punch tiny holes into a shape's fill. Compound
 * per-color paths are painted with fill-rule evenodd, so inner subpaths become transparent holes —
 * the texture stays pure vector geometry and renders identically on canvas, in PNG and in the
 * exported SVG.
 *
 * Specks are placed on a lattice anchored to the document origin (not per pixel), so the pattern
 * flows continuously across adjacent same-color pixels; only the shape's outer border can carry a
 * clean gap margin.
 *
 * The family is split by concern: `texture-core` (hashing / PRNG / flecks / distributions),
 * `texture-halftone` (dot fusion and distress), `texture-region` + `texture-region-cells`
 * (pixels/outline placement) and `texture-field` (metaball placement).
 */

export type { TextureCell } from './region'
export { regionTextureFragments } from './region'
export { fieldTextureFragments } from './field'
