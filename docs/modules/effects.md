# Effects — technical notes

## Scope

Selection-scoped destructive effects in [`src/engine/effects/`](../../src/engine/effects/warp.ts):
displacement warps ([`warp.ts`](../../src/engine/effects/warp.ts)), stylize post-ops
([`stylize.ts`](../../src/engine/effects/stylize.ts)), pixel-art morphology ops
([`morpho.ts`](../../src/engine/effects/morpho.ts)), the generative filter pack
([`filters.ts`](../../src/engine/effects/filters.ts)), geometric selection transforms
([`selection-xform.ts`](../../src/engine/effects/selection-xform.ts)), and the deterministic
per-cell form jitter ([`jitter.ts`](../../src/engine/effects/jitter.ts)). All operate on sparse ink
maps over the **square grid only**, all bake through the same nearest-neighbor remap, and all are one
undoable commit via the `effect`/`transform` slices ([state-store](state-store.md)). The
non-destructive alternative for procedural objects is the `mod.warp` *node*
([node-graph](node-graph.md)); the symmetry family in the same folder has its own page —
[symmetry](symmetry.md).

## Module map

| File | Role |
|---|---|
| [`src/engine/effects/selection-xform.ts`](../../src/engine/effects/selection-xform.ts) | scale / rotate / flip as inverse-sampling cell remaps: `selectionBox`, `xformMatrices`, `xformRegion`, `mapInk`, `InkCell` |
| [`src/engine/effects/warp.ts`](../../src/engine/effects/warp.ts) | bulge, fisheye, twirl, waveH/V, zigzag, polar/unpolar, roughen: `warpField`, `warpRegion`, `warpInk`, `inkBox`, `isReversibleWarp` |
| [`src/engine/effects/stylize.ts`](../../src/engine/effects/stylize.ts) | outline, drop shadow, dithered glow — `outlineInk`, `dropShadowInk`, `glowInk`, `stylizeInk`; returns only ADDED cells |
| [`src/engine/effects/morpho.ts`](../../src/engine/effects/morpho.ts) | pixel ops: `blockifyInk` (n×n majority quantize), `dilateInk`/`erodeInk` (8-neighborhood passes), `pixelPerfectInk` (stair cleanup), `despeckleInk`, `outlineOnlyInk`, `silhouetteInk`, `longShadowInk`, `scanlinesInk`, dispatched by `pixelOpInk` (shrinking ops replace, additive ops merge) |
| [`src/engine/effects/filters.ts`](../../src/engine/effects/filters.ts) | the generative filter family contract: `FilterOp` (six ids), merged `FilterParams` + defaults, chip lists, `filterInk()` dispatcher |
| [`src/engine/effects/gooey.ts`](../../src/engine/effects/gooey.ts) | `blobifyInk` (metaball kernel fusion, strongest-contributor attribution), `smoothenInk` (concave corner fills, 1..3 passes) |
| [`src/engine/effects/figures.ts`](../../src/engine/effects/figures.ts) | `figurefyInk` (every cell → k×k block with a cell-shape figure, figure/cut modes), `patternizeInk` (`patternAt` re-masking with density/scale/invert) |
| [`src/engine/effects/organic.ts`](../../src/engine/effects/organic.ts) | `dripInk` (hash-varied melt trails from run ends), `dissolveInk` (hash / value-noise gated removal) |
| [`src/engine/effects/jitter.ts`](../../src/engine/effects/jitter.ts) | per-cell cell-form variation: `jitterAt` (size/angle noise), `hasJitter` gate |

Tests: [`warp.test.ts`](../../src/engine/effects/warp.test.ts),
[`stylize.test.ts`](../../src/engine/effects/stylize.test.ts),
[`morpho.test.ts`](../../src/engine/effects/morpho.test.ts),
[`filters.test.ts`](../../src/engine/effects/filters.test.ts),
[`gooey.test.ts`](../../src/engine/effects/gooey.test.ts),
[`figures.test.ts`](../../src/engine/effects/figures.test.ts),
[`organic.test.ts`](../../src/engine/effects/organic.test.ts),
[`selection-xform.test.ts`](../../src/engine/effects/selection-xform.test.ts),
[`jitter.test.ts`](../../src/engine/effects/jitter.test.ts). Symmetry tests:
[`symmetry.test.ts`](../../src/engine/effects/symmetry.test.ts) (see [symmetry](symmetry.md)).

## How it works

**Transforms** ([`selection-xform.ts`](../../src/engine/effects/selection-xform.ts) header):
"Selection transforms (scale / rotate / flip) as nearest-neighbor cell remapping… The mapping is
inverse-sampling: every target cell in the transformed bounding region asks 'which source cell owns
my center?' — so upscaling fills solid instead of scattering holes." Call order:
`selectionBox(cells, cellObj, ids, bw, bh)` bounds the selection's ink → `xformMatrices(x, box)`
gives the `fwd`/`inv` pair (scale anchors at the drag corner `ax, ay`; rotate/flip pivot on the box
center; flip is its own inverse) → `xformRegion` forward-maps the four corners to the target box →
`mapInk` walks every target cell, samples `m.inv(center)` and copies `{ v, o }` values. No
interpolation anywhere — this is pixel art.

**Warps** ([`warp.ts`](../../src/engine/effects/warp.ts) header): "Pure buffer math over sparse ink
maps — the same inverse-sampling contract… `roughen` is the one forward op." `warpField(kind, box, p)`
builds a continuous `(x, y) → [sx, sy]` function evaluated per target-cell center — no field
grid/discretization; only the *target region* is grown by the field's max displacement
(`warpRegion`) so effects don't clip themselves. Exact mappings: bulge = power-law radial scale
(`e = 1+k`); fisheye = radius divided by `1+f(1−t)²`; twirl = rotation `a = k·2π(1−t)²`; waves
subtract `amp·sin(2π·coord/wl)`; zigzag is the radial ripple; `polar` is implemented as the *inverse*
of polar→rect (rect↔polar round-trip pairs). `warpInk` runs the loop; `roughenInk` instead scatters
boundary cells (any cell with an empty 4-neighbour) by `hash2`-seeded jitter — collisions overwrite,
which is the point. `warp.test.ts` pins the fields, the `mod.warp` node and the store-level
`warpSelection`.

**Stylize** ([`stylize.ts`](../../src/engine/effects/stylize.ts) header): "Every function takes the
selection's ink snapshot and returns only the ADDED cells — the caller merges them over the source
and bakes through the usual selection path. All ops are deterministic: the glow's density falloff is
an ordered Bayer screen, not randomness." `stylizeInk(op, src, v, p, space)` dispatches: outline =
8-neighbour 1-cell ring that never overwrites ink (`outlineInk`); shadow = offset copy minus source
(`dropShadowInk`); glow = BFS frontier tracking Chebyshev rings (`glowInk`), keeping ring *k* where
`thresholdAt(BAYER8, 8, 64, x, y) < 1 − k/(radius+1)` — a Bayer-dot fade that introduces no new
palette colors (matrices from [`src/engine/dither/matrices.ts`](../../src/engine/dither/matrices.ts)).

**Generative filters** ([`filters.ts`](../../src/engine/effects/filters.ts) → `gooey.ts` /
`figures.ts` / `organic.ts`): six ops that *regenerate* the ink instead of reshaping it, dispatched
by `filterInk(op, src, p, { box, bw, bh })`. `blobifyInk` splats the metaball kernel
(`t = 1 − d²/R²`, falloff power tight 3 / smooth 2 / gooey 1 — mirrored from
[`geometry/metaball-field.ts`](../..//src/engine/geometry/metaball-field.ts)) from every ink cell
over a radius-padded box and keeps cells whose summed field reaches the iso; added cells take the
strongest single contributor's value + owner (the donor comparison runs in f64 so exactly-equal
kernels never flip). `smoothenInk` fills the empty cell of any 2×2 block holding the other three
inked cells — the additive complement of morpho's `pixelPerfect`. `figurefyInk` turns each source
cell into a k×k block anchored at the selection box origin whose sub-cells sample
`cellShapeHit` (any registered cell form, default shape params); `cut` mode inverts the mask.
`patternizeInk` re-masks through `patternAt` at absolute buffer coordinates. `dripInk` grows
`round(length·(1−variation+variation·hash2))` trails from run-end cells only; `dissolveInk` keeps
cells whose per-cell hash (scale 1) or smooth value noise (scale > 1) passes the amount.

**Cell-form jitter** ([`jitter.ts`](../../src/engine/effects/jitter.ts)): not a selection op — a
render-time modifier. `jitterAt(style, i, stride)` samples two smooth value-noise fields (period 8
cells, `valueNoise` from [`src/engine/texture/core.ts`](../../src/engine/texture/core.ts)) keyed by
the cell's grid position, returning a `size` multiplier and an absolute `angle` offset, so
neighboring cells correlate (organic clumping) instead of flickering like white noise. Consumers:
[`geometry/shape.ts`](../../src/engine/geometry/shape.ts) and [`grids/geometry.ts`](../../src/engine/grids/geometry.ts);
`hasJitter` gates the square run-merge fast path.

## Data structures

- `SelectionXform` — discriminated union (scale/rotate/flip); `CellBox` is half-open `[x0, x1)`.
- Ink maps: `Map<index, InkCell { v, o }>` (value + element attribution) — the same sparse
  representation scene objects use, so graph-driven objects can be baked and remapped uniformly.
- `WarpParams { amount −100..100, radiusPct 10..200, wavelength 2..256, seed }`;
  `strength = clamp(amount/100, −0.9, 1)` (never fully inverts).
- `StylizeParams { radius 1..16, dx, dy }`, `DEFAULT_STYLIZE_PARAMS = { radius: 3, dx: 1, dy: 1 }`.

## Invariants & constraints

- Square grid only — enforced at the slice/UI level; non-square docs don't offer the ops.
- Procedural (graph-driven) objects **freeze into plain cells** when baked (`effect.slice.ts`) —
  documented UX trade-off, undoable.
- Determinism: glow's Bayer screen and `roughen`'s `hash2` jitter are stable across runs; no
  `Math.random` anywhere. Zero-spread jitter never calls into the noise (`jitter.ts` header).
- `isReversibleWarp(kind)` — the six fields that are identity at amount 0 (polar is a pure remap,
  roughen a scatter) — is what the UI uses to decide amount semantics.

## Performance characteristics

All three remaps are O(target region) nearest-neighbor passes with no allocations in the inner loop
beyond the output map; the expensive part in practice is the subsequent composite + geometry rebuild
(see [render-pipeline](../architecture/render-pipeline.md)). Not separately benched — region sizes
are selection-sized, not canvas-sized.

## Testing

- [`warp.test.ts`](../../src/engine/effects/warp.test.ts) — field math (determinism, region growth,
  round-trips), `mod.warp` node, `warpSelection` store integration.
- [`stylize.test.ts`](../../src/engine/effects/stylize.test.ts) — add-only contract of the three ops,
  `stylizeSelection` store integration.
- [`selection-xform.test.ts`](../../src/engine/effects/selection-xform.test.ts) — `selectionBox`,
  `mapInk`.
- [`jitter.test.ts`](../../src/engine/effects/jitter.test.ts) — noise correlation, zero-spread gate.

## Related decisions

- [node-graph](node-graph.md) — the non-destructive `mod.warp` path.
- [symmetry](symmetry.md) — the other `effects/` family.

## OpenSpec capabilities

- `openspec/specs/drawing-tools/spec.md` (selection effects)
- `openspec/changes/add-pixel-stylization-pack/` (morphology ops — pending archive)
- `openspec/changes/add-pixel-generative-filters/` (blobify / smoothen / figurefy / patternize /
  drip / dissolve — pending archive)

## Known limitations

- No non-destructive selection effects (bake-only, undoable).
- No interpolation/sub-cell precision on rotate — nearest-neighbor by design.
- Stylize ops add no new colors (glow reuses the source color); no "outer glow in second color"
  variant.
