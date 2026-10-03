# Texture — technical notes

## Scope

Baked vector texture: the `grain` / `grunge` / `halftone` / `hatch` effects that punch tiny
**transparent holes** into a shape's fill. Everything lives in [`src/engine/texture/`](../../src/engine/texture/index.ts);
raster-free by design — the cost profile is the reason textured documents hit the stroke-fallback
cliff ([render-pipeline](../architecture/render-pipeline.md)). The fill-tool pattern library also
lives in this folder (`fill*.ts`) but is documented in [dither-and-patterns](dither-and-patterns.md).

## Module map

| File | Role |
|---|---|
| [`src/engine/texture/index.ts`](../../src/engine/texture/index.ts) | barrel: `regionTextureFragments` / `fieldTextureFragments`, type `TextureCell` |
| [`src/engine/texture/core.ts`](../../src/engine/texture/core.ts) | `MAX_REGION_FLECKS = 20_000`, `ISO = 0.5`, `hash2`/`hash` (32-bit mix), `mulberry32`, `valueNoise`, fleck emitters (`emitFleck`, `fleckRotation`, `circleFleck`) |
| [`src/engine/texture/region.ts`](../../src/engine/texture/region.ts) | region scan orchestrator `regionTextureFragments`, `TextureCell`, 9-point acceptance sampler `regionSampler`/`fillPointOk` |
| [`src/engine/texture/region-cells.ts`](../../src/engine/texture/region-cells.ts) | per-lattice-point emitters `regionScatterCell` / `regionHalftoneCell` (+ `pullToFillCenter`, even-scatter `spaced`) |
| [`src/engine/texture/patterns.ts`](../../src/engine/texture/patterns.ts) | 14 speck distributions (`dist`): `distWeight` — scatter…bayer; `angleRad`, `DistContext` |
| [`src/engine/texture/halftone.ts`](../../src/engine/texture/halftone.ts) | dot fusion (union-find), star-union blobs, wobbly circles, cell-form marks, spray filter (`emitHalftoneDots`, `filterSpray`, `htKey`) |
| [`src/engine/texture/hatch.ts`](../../src/engine/texture/hatch.ts) | screen-line hatch adapters `hatchRegionFragments` / `hatchFieldFragments` over `dither/screen-lines` |
| [`src/engine/texture/field.ts`](../../src/engine/texture/field.ts) | metaball mode `fieldTextureFragments`: field sampling (`fieldAt`, `fieldSolid`), gradient nudging, shared RNG stream |
| [`src/engine/texture/lattices.ts`](../../src/engine/texture/lattices.ts) | non-grid halftone mark placement `latticeHalftoneDots` (hex/rings/sunburst/spiral/phyllotaxis/scatter via the screen engine) |
| [`src/engine/texture/figure.ts`](../../src/engine/texture/figure.ts) | `figureSpace` — combined occupancy + boundary distance for `gapMode: 'figure'` |
| [`src/engine/texture/fill.ts`](../../src/engine/texture/fill.ts) | fill-tool application (`applyFillStyle`, `fillSelectionCells`) — see [dither-and-patterns](dither-and-patterns.md) |
| [`src/engine/texture/fill-patterns.ts`](../../src/engine/texture/fill-patterns.ts) | fill-pattern math (`patternAt`, `gradientAt`) — see [dither-and-patterns](dither-and-patterns.md) |
| [`src/engine/texture/fill-data.ts`](../../src/engine/texture/fill-data.ts) | fill-pattern catalog (`PATTERNS`, `GRADIENTS`, `FillStyle`) — see [dither-and-patterns](dither-and-patterns.md) |

Tests are colocated: [`texture.test.ts`](../../src/engine/texture/texture.test.ts),
[`hatch.test.ts`](../../src/engine/texture/hatch.test.ts),
[`lattices.test.ts`](../../src/engine/texture/lattices.test.ts),
[`fill.test.ts`](../../src/engine/texture/fill.test.ts),
[`glyph-fill.test.ts`](../../src/engine/texture/glyph-fill.test.ts); bench
[`hatch.bench.ts`](../../src/engine/texture/hatch.bench.ts).

## How a texture is drawn

Model (barrel header): "extra path fragments that punch tiny holes into a shape's fill. Compound
per-color paths are painted with fill-rule evenodd, so inner subpaths become transparent holes —
the texture stays pure vector geometry and renders identically on canvas, in PNG and in the
exported SVG." One implementation serves canvas, PNG, SVG and thumbnails; that is *why* it is
holes-in-vector and not a raster overlay.

End-to-end, in call order:

1. **Settings.** The user's knobs live in `TextureSettings` in
   [`src/engine/core/doc.ts`](../../src/engine/core/doc.ts): `effect` (none/grain/grunge/halftone/hatch),
   intensity `amount`, feature `scale`, speck `sizeMin`/`sizeMax`/`shape`, grunge `edge`, the 14-way
   `dist` selector, `gap` + `gapMode`, `even`, `angle`, `seed`, the halftone distress knobs
   (`jitter`, `variation`, `wobble`, `merge`, `dropout`, `spray`, `ramp`, `htLattice`) and
   `hatchStyle`. Each drawn element freezes its own copy inside `ElementStyle.texture`.
2. **Gate.** The geometry builder ([`src/engine/geometry/shape.ts`](../../src/engine/geometry/shape.ts))
   textures only when `effect !== 'none'` on a plain square grid: `textured = tex.effect !== 'none' && plainSquare && !toneSize && sizeJitter === 0`
   (rotation, non-square forms and tone sizing would paint specks outside the ink). Textured cells
   are collected per palette value as `TextureCell` records — fill rect, corner radii, tile bounds
   and same-value neighbor flags (`connectedL/T/R/B`).
3. **Region scan.** `regionTextureFragments(cells, t, value, fig?)` in
   [`region.ts`](../../src/engine/texture/region.ts) derives the metrics: lattice pitch
   `L = 0.14·clamp(scale, 0.1, 8)` **cells anchored to the document origin** (so the pattern flows
   seamlessly across adjacent same-color pixels; only sides facing open space carry the gap margin),
   `Ld = L/sub` doc units, `gapU = clamp(gap, 0, 0.45)/sub`, the grunge edge band, and a
   `DistContext` (center/extents/angle of the region's tile envelope) that structured distributions
   anchor to. `regionGridRange` computes the lattice (or rotated screen-grid) index range plus the
   `stride`/`keep` factors that cap output at `MAX_REGION_FLECKS`.
4. **Acceptance sampler.** `regionSampler` builds a spatial `locate` map (tile under a doc point)
   and `fits(fx, fy, a)` — nine probe points (4 corners, 4 edge midpoints, center) that must each
   pass `sampleOk`: inside the per-side placement bounds (`regionBounds`: connected sides run to the
   tile edge, open sides are inset by `gapU`), inside the painted fill rect with corner fillets
   (`fillPointOk`), and — in figure mode — at least `gapU` away from the whole-figure silhouette
   (`fig.edgeDist`).
5. **Branch by effect.** `hatch` short-circuits to `hatchRegionFragments` (step 8). Halftone with a
   non-grid `htLattice` goes through `latticeHalftoneDots` (step 7). Everything else runs the
   double lattice loop: each point draws `rand = mulberry32(hash2(I, J, seed + key·1013))`, pulls
   `r1..r5` **up front in a fixed order** (an invariant: reordering draws changes output), then
   calls `regionScatterCell` (or `regionHalftoneCell`).
6. **Per-distribution speck placement.** `regionScatterCell` weights acceptance by
   `distWeight(t, x, y, pitch, dc)` from [`patterns.ts`](../../src/engine/texture/patterns.ts):
   random fields — scatter (uniform), clumps (single-octave stains), perlin (3-octave fractal),
   voronoi (seeded stain colonies), streaks (sine bands along `angle`); structured patterns anchored
   to `dc` — waves, sunburst, spiral, honeycomb, scales, weave, checker, fade and bayer (8×8 matrix
   thresholding 2-octave noise). Grunge multiplies in edge wear (`edgeRef`: figure silhouette or
   open-side distance). Survivors get a size, jittered placement, a "fit, don't reject" pull toward
   the tile's fill center (`pullToFillCenter`), optional even-scatter spacing (`spaced`, 0.8·pitch
   grid buckets) and emit through `emitFleck` (dot/chip/triangle/star/hex/diamond/cross/ring/dash or
   square, rotated by `fleckRotation`).
7. **Halftone dots and distress.** `regionHalftoneCell` places dots on the (optionally rotated)
   screen grid with jitter/ramp/variation/dropout knobs, then
   [`halftone.ts`](../../src/engine/texture/halftone.ts) `emitHalftoneDots` fuses touching/overlapping
   neighbors by union-find and emits each cluster as **one** star-union blob polygon
   (`clusterBlobPath`) — merged clusters must be a single subpath or evenodd would XOR them against
   themselves. Singletons render as plain/wobbled circles or, for shaped marks, the matching cell
   form (`cellShapeFragment` from [`src/engine/cell-shapes/`](../../src/engine/cell-shapes/index.ts)).
   `filterSpray` drops satellite specks that would land on a dot.
8. **Hatch line systems.** `hatchRegionFragments` in [`hatch.ts`](../../src/engine/texture/hatch.ts)
   maps the knobs (amount = line width, scale = spacing, angle = direction, ramp = directional width
   gradient, wobble = waviness, dropout = missing segments, variation = per-line width jitter) into
   a `HatchScan` and delegates to `hatchFragments` in
   [`src/engine/dither/screen-lines.ts`](../../src/engine/dither/screen-lines.ts), which samples each
   line, clips it against the region sampler and emits constant-width evenodd strips (straight or a
   crossed pair at +90°, budgets `MAX_HATCH_LINES`/`MAX_HATCH_RUNS`).
9. **Consumption.** The returned fragment string is appended to that color's compound path in
   `geometry/shape.ts`; the evenodd fill turns every subpath into a hole.

**Field adapter (metaball render mode).** [`src/engine/geometry/metaball.ts`](../../src/engine/geometry/metaball.ts)
hands the blob's scalar field (`TextureField { f, fw, fh, scale }`) to `fieldTextureFragments` in
[`field.ts`](../../src/engine/texture/field.ts). A candidate survives when its four corners sample
above the contour (`fieldSolid`, threshold `ISO = 0.5`) — and when they don't, the speck is nudged
along the field gradient (`nudgeAlongGradient`, fit don't reject), so grunge stays dense at blob
edges. Unlike the region scan, the whole field walk shares **one** RNG stream
(`mulberry32(hash(key, seed))`) whose draw order across cells must be preserved exactly. Hatch goes
through `hatchFieldFragments`, testing squares via `fieldSolid` instead of `fits`.

## Data structures

- `TextureCell` (`region.ts`) — one paintable cell in doc units: fill rect `x/y/w/h`, corner
  `radii` + `chamfer`, tile bounds `cx0..cy1`, and the four same-value neighbor flags that decide
  where texture runs across vs where the gap margin applies.
- `RegionState` / `FieldState` — the immutable metrics plus the mutable accumulators (`out` string,
  `dots`/`dotKeys`/`dotAt` halftone buffers, `sprayCand`, `count`, and the region's `taken` even-scatter
  buckets or the field's shared `rand` stream).
- `HtDot { cx, cy, r }` + packed grid key `htKey(i, j)` (16 bits per axis around a `0x8000` bias).
- `FigureSpace { inside, edgeDist }` — occupancy index over every painted cell of **all** colors
  plus boundary segments bucketed by tile; `edgeDist` walks a 5×5 tile neighborhood, exact within
  2 tiles and conservative (over-estimating) beyond.
- `TextureField` — minimal view of a metaball field: values on a regular grid plus doc-units-per-node
  `scale`, sampled bilinearly by `fieldAt`.

## Invariants & constraints

- Determinism: `hash2` + mulberry32 per lattice point; pure and platform-independent — canvas/PNG/SVG
  output identical for a given seed.
- RNG draw order is load-bearing: `r1..r5` are drawn up front for both scan branches, halftone spray
  draws `s1..s3` only when enabled; the field scan must not reorder its shared stream.
- Texture renders **only on plain square grids** (`effect !== 'none' && plainSquare && !toneSize &&
  sizeJitter === 0`) — and its presence disables the RLE run-merge fast path and the O(staged)
  `stagingPreview` (usable-style guard), which is precisely why strokes on textured documents
  rebuild the whole document per rAF frame.
- Merged halftone clusters must be a single evenodd subpath; spray specks are kept inside the middle
  half of their cell so sprays from adjacent cells can never touch.
- `gapMode: 'cell'` insets flecks per cell; `'figure'` shares one `FigureSpace` across all colors.
- Hatch budgets: `MAX_HATCH_LINES = 800`, `MAX_HATCH_RUNS = 6000`, waved-sample cap
  `MAX_WAVED_SAMPLES = 400_000`, line width ≤ 0.95 of the spacing (`WIDTH_SHARE`).

## Performance characteristics

Grain texture rebuild ≈ **1 691 ms** at 512²/5 % ink (working-tree measurement including
then-uncommitted texture WIP; `render-modes.bench.ts`, [research §5](../research/performance.md)) —
the worst interaction cliff found, because it *is* the per-rAF-frame fallback cost. PERFLOG
2026-09-30 confirms 1.7–1.9 s per rebuild in the browser checkpoint. `MAX_REGION_FLECKS = 20_000`
caps fleck count; halftone coarsens its lattice stride (`√(est/cap)`) instead of probabilistic
thinning so the grid stays regular. Hatch fragment costs are pinned locally by
[`hatch.bench.ts`](../../src/engine/texture/hatch.bench.ts) (128² region). A cost decomposition of
the texture path (region scan vs fleck emission vs fits-probes) is a recorded follow-up (research §5).

## Testing

- [`texture.test.ts`](../../src/engine/texture/texture.test.ts) — `regionTextureFragments`
  (determinism, per-distribution output, fillet/gap acceptance), `fieldTextureFragments` (metaball
  mode), and end-to-end `texture in geometry` (SVG parity via `buildGeometry`/`buildSvg`, project
  round-trips).
- [`hatch.test.ts`](../../src/engine/texture/hatch.test.ts) — the hatch texture adapters plus the
  `mod.hatch` node's coverage test.
- [`lattices.test.ts`](../../src/engine/texture/lattices.test.ts) — non-grid halftone lattices.
- [`fill.test.ts`](../../src/engine/texture/fill.test.ts) / [`glyph-fill.test.ts`](../../src/engine/texture/glyph-fill.test.ts) — the fill-pattern library (see
  [dither-and-patterns](dither-and-patterns.md)).
- Bench: [`hatch.bench.ts`](../../src/engine/texture/hatch.bench.ts); grain rebuild via
  [`src/engine/geometry/render-modes.bench.ts`](../../src/engine/geometry/render-modes.bench.ts).

## Related decisions

- [ADR-0002](../decisions/0002-canvas2d-rendering-webgpu-deferred.md) — evenodd holes.
- [geometry](geometry.md) — the usable-style guard that excludes texture from stagingPreview.

## OpenSpec capabilities

- `openspec/specs/pixel-styling/spec.md` (texture settings)

## Known limitations

- Square grids only; no texture on non-square lattices, rotated forms or tone-sized styles.
- Per-tile texture caching (post-tile-model) is the planned fix for the rebuild cliff.
- Known quirk: [`field.ts`](../../src/engine/texture/field.ts) ⇄ [`hatch.ts`](../../src/engine/texture/hatch.ts)
  form a real value-level cycle (`hatchFieldFragments` ⇄ `fieldSolid`, plus the shared `FieldState`
  type). It is confined to the `texture/` folder, predates the split, and is safe under ESM
  hoisting (both are function declarations, neither is called at module top level) — keep new
  cross-adapter helpers out of the pair to avoid growing it.
