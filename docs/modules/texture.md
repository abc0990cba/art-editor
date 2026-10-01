# Texture — technical notes

## Scope

Baked vector texture: the `grain` / `grunge` / `halftone` effects that punch tiny
**transparent holes** into a shape's fill. Files: `src/engine/texture.ts` (barrel) through
`texture-core/-field/-figure/-halftone/-patterns/-region/-region-cells.ts`. Raster-free by
design; the cost profile is the reason textured documents hit the stroke-fallback cliff
([render-pipeline](../architecture/render-pipeline.md)).

## Module map

| File | Role |
|---|---|
| `src/engine/texture.ts` | barrel: `regionTextureFragments` / `fieldTextureFragments`, `TextureCell` |
| `src/engine/texture-core.ts` | `MAX_REGION_FLECKS = 20_000`, `hash2` (32-bit mix) |
| `src/engine/texture-region.ts` | region scan → lattice → fleck emission (the main pipeline) |
| `src/engine/texture-region-cells.ts` | per-lattice-point scatter/halftone acceptance |
| `src/engine/texture-patterns.ts` | 14 distributions (`dist`): scatter…bayer |
| `src/engine/texture-halftone.ts` | dot fusion (union-find), star-union blobs, wobbly circles, spray filter |
| `src/engine/texture-field.ts` | metaball-field mode: "fit, don't reject" speck nudging |
| `src/engine/texture-figure.ts` | `figureSpace` — combined occupancy + boundary distance for `gapMode: 'figure'` |

## How it works

Model (barrel header): "extra path fragments that punch tiny holes into a shape's fill.
Compound per-color paths are painted with fill-rule evenodd, so inner subpaths become
transparent holes — the texture stays pure vector geometry and renders identically on canvas,
in PNG and in the exported SVG." One implementation serves canvas, PNG, SVG and thumbnails;
that is *why* it is holes-in-vector and not a raster overlay.

Pipeline (`texture-region.ts`): scan the same-color region into `TextureCell` records (with
same-value neighbor flags) → place a fleck lattice anchored **to the document origin**
(`pitch = 0.14·clamp(scale, 0.1, 8)` cells — so the pattern flows continuously across
adjacent same-color pixels; only the outer border can carry a clean gap margin) → per lattice
point derive `rand = mulberry32(hash2(I, J, seed + key·1013))` and draw r1..r5 **up front in
a fixed order** (an invariant: reordering draws changes output) → accept via 9 probe points
inside the fill rect (corner fillets aware), per-side gap bounds (connected sides run to the
tile edge), and figure-mode silhouette distance → emit the fleck path.

Distributions (`texture-patterns.ts`): scatter (uniform), clumps/perlin (value noise
octaves), voronoi (seeded stain colonies), streaks (sine bands), plus structured
waves/sunburst/spiral/honeycomb/scales/weave/checker/fade and bayer (8×8 matrix thresholding
2-octave noise). Halftone (`texture-halftone.ts`) fuses touching candidate dots by union-find
and emits each cluster as **one** star-union blob polygon — merged clusters must be a single
subpath or evenodd would XOR them against themselves.

Field mode (`texture-field.ts`) textures metaball blobs: "A candidate survives when its four
corners sample above the contour — and when they don't, the speck is nudged along the field
gradient (fit, don't reject), so grunge stays dense at blob edges", with a shared RNG stream
whose draw order across cells must be preserved exactly.

## Invariants & constraints

- Determinism: `hash2` + mulberry32 per lattice point; pure and platform-independent —
  canvas/PNG/SVG output identical.
- Texture renders **only when `effect !== 'none'` on a plain square grid without tone
  sizing** — and its presence disables the RLE run-merge fast path and the O(staged)
  `stagingPreview` (usable-style guard), which is precisely why strokes on textured documents
  rebuild the whole document per rAF frame.
- `gapMode: 'cell'` insets flecks per cell; `'figure'` shares one `FigureSpace` across all
  colors (exact within 2 tiles, conservative beyond).

## Performance characteristics

Grain texture rebuild ≈ **1 691 ms** at 512²/5 % ink (working-tree measurement including
then-uncommitted texture WIP; `render-modes.bench.ts`, `docs/research/performance.md` §5) —
the worst interaction cliff found, because it *is* the per-rAF-frame fallback cost.
`MAX_REGION_FLECKS = 20_000` caps fleck count; halftone uses an integer lattice stride
instead of probabilistic thinning. Texture cost decomposition (region scan vs fleck emission
vs fits-probes) is a recorded follow-up (research §5).

## Testing

`texture.test.ts` (determinism, distributions, halftone fusion); benches:
`render-modes.bench.ts` (grain rebuild).

## Related decisions

- [ADR-0002](../decisions/0002-canvas2d-rendering-webgpu-deferred.md) — evenodd holes.
- [geometry](geometry.md) — the usable-style guard that excludes texture from stagingPreview.

## OpenSpec capabilities

- `openspec/specs/pixel-styling/spec.md` (texture settings)

## Known limitations

- Square grids only; no texture on non-square lattices.
- Per-tile texture caching (post-tile-model) is the planned fix for the rebuild cliff.
