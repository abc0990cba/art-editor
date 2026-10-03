# Dither & patterns — technical notes

## Scope

Two ink-style systems: (1) the shared threshold machinery in [`src/engine/dither/`](../../src/engine/dither/matrices.ts)
— ordered-dither matrices, procedural threshold fields, blue noise, scan-path orders, the halftone
screen engine and the screen-line systems; and (2) the fill tool's pattern library in
[`src/engine/texture/fill*.ts`](../../src/engine/texture/fill.ts) — two-color textures and dithered
gradients per cell. The *image-import* dithering pipeline is a separate consumer of the same
matrices and fields — see [image-import](image-import.md).

## Module map

| File | Role |
|---|---|
| [`src/engine/dither/matrices.ts`](../../src/engine/dither/matrices.ts) | `BAYER2/4/8/16/32` (recursive `expandBayer`), `CLUSTER4`, `HALFTONE4`, `ROSETTE8`, `ELLIPTICAL8`, `EUCLIDEAN8`, `WEAVE8`, `TWILL8`, `HOUNDSTOOTH8`, `BLUE_NOISE8`, `VOID_CLUSTER8`, `PATTERN8`, `thresholdAt`, `crosshatchAt` |
| [`src/engine/dither/fields.ts`](../../src/engine/dither/fields.ts) | procedural threshold fields: lines h/v/diag, IGN, spiral, rings, sunburst, phyllotaxis, zigzag, fractal noise, screen-45, screen-wave (wired to import ids by `ORDERED_FIELDS` in [`import/ordered.ts`](../../src/engine/import/ordered.ts)) |
| [`src/engine/dither/blue-noise.ts`](../../src/engine/dither/blue-noise.ts) | generated 16×16 blue-noise mask (`blueNoiseMatrix`, `blueNoise16` — toroidal farthest-point ranking, memoized) |
| [`src/engine/dither/scans.ts`](../../src/engine/dither/scans.ts) | scan-path orders for path-driven error diffusion: `scanOrder(kind, tw, th)` over `column / diagonal / spiral / hilbert / random` |
| [`src/engine/dither/screen-engine.ts`](../../src/engine/dither/screen-engine.ts) | halftone screen core shared by fills, textures and the node graph: 7 lattices (`latticePoints`), 10 marks (`screenShapeOn` via the cell-form registry), size/density/twist tone mappings (`screenCellOn`), `LatticeIndex` spatial hash |
| [`src/engine/dither/screen-lines.ts`](../../src/engine/dither/screen-lines.ts) | parallel line systems: `HatchSystem`, analytic `hatchDistance`, clip-and-emit scanner `hatchFragments`, `stripPath` evenodd strip emitter |
| [`src/engine/dither/catalog.ts`](../../src/engine/dither/catalog.ts) | the declarative import-dither catalog (`ImportDither`, `DITHER_CATALOG`, `DITHER_FAMILIES`) — see [image-import](image-import.md) |
| [`src/engine/texture/fill.ts`](../../src/engine/texture/fill.ts) | apply logic: `applyFillStyle`, `fillSelectionCells`, `patternCoord`; re-exports the other two modules |
| [`src/engine/texture/fill-patterns.ts`](../../src/engine/texture/fill-patterns.ts) | pattern/gradient math: `patternAt`, `gradientAt`, `screenPatternAt`, `PatternOpts` |
| [`src/engine/texture/fill-data.ts`](../../src/engine/texture/fill-data.ts) | catalog: `PATTERNS` (22), `GRADIENTS`, `HT_SHAPES`, `SCALED_PATTERNS`, `GRAIN_PATTERNS`, `FillStyle`, `DEFAULT_FILL_STYLE` |

Tests: [`matrices.test.ts`](../../src/engine/dither/matrices.test.ts),
[`catalog.test.ts`](../../src/engine/dither/catalog.test.ts),
[`screen-engine.test.ts`](../../src/engine/dither/screen-engine.test.ts),
[`screen-lines.test.ts`](../../src/engine/dither/screen-lines.test.ts),
[`texture/fill.test.ts`](../../src/engine/texture/fill.test.ts),
[`texture/glyph-fill.test.ts`](../../src/engine/texture/glyph-fill.test.ts); benches
[`dither.bench.ts`](../../src/engine/dither/dither.bench.ts),
[`texture/hatch.bench.ts`](../../src/engine/texture/hatch.bench.ts).

## How it works

### Threshold matrices ([`matrices.ts`](../../src/engine/dither/matrices.ts))

Header: "Every matrix is stored in the canonical rank convention (0 = the first threshold to flip,
so low ranks map to dark tones) and read through `thresholdAt()` into a 0..1 comparison value: a
pixel tone t picks the second palette color when `t > thresholdAt(x, y)`." Bayer 4/8/16/32 are
generated recursively from `BAYER2` (`prev·4 + BAYER2[quadrant]`). The 8×8 print/textile screens
(rosette, elliptical, euclidean, weave, twill, houndstooth) are built at module load by the internal
`screenRanks` (toroidal spot-function ranking around dot centers) and `patternRanks` (binary pattern
→ ink-first ranks) helpers. `thresholdAt(m, n, levels, x, y)` positive-mods the coordinates, so any
integer position tiles; `levels` is **caller-supplied** and intentionally differs per consumer
(Bayer n uses n²; blue-noise uses 16; `VOID_CLUSTER8` uses 256; `PATTERN8` uses 32 in import) — do
not "unify" without checking both consumers' visual baselines.

### Screen engine ([`screen-engine.ts`](../../src/engine/dither/screen-engine.ts))

One lattice generator, `latticePoints(kind, pitch, seed, w, h)` over
`ScreenLattice = grid | hex | rings | sunburst | spiral | phyllotaxis | scatter` (scatter is a seeded
Mitchell best-candidate sample), returning `ScreenPoint { x, y, n }` where `n` is the normalized
distance from the box center (radial order for ramps). `LatticeIndex` buckets points for
O(1)-amortized nearest-mark queries. `screenCellOn(style, index, x, y, toneAt)` decides per cell:
`density` keeps full marks stochastically (`hash2`), `size` grows the mark area with `√tone`,
`twist` rotates the mark by `tone·twist`. Marks are tested through `screenShapeOn` → `cellShapeHit`
from [`src/engine/cell-shapes/`](../../src/engine/cell-shapes/index.ts), so screen marks and canvas
cell forms share one geometry. Consumers: the fill `screen` pattern (via
[`texture/fill-patterns.ts`](../../src/engine/texture/fill-patterns.ts) — its own analytic
`screenPatternAt`), the texture panel's non-grid halftone lattices
([`texture/lattices.ts`](../../src/engine/texture/lattices.ts)), and `mod.halftone`
([`nodes/halftone.node.ts`](../../src/engine/nodes/halftone.node.ts)).

### Screen lines ([`screen-lines.ts`](../../src/engine/dither/screen-lines.ts))

`HatchSystem { angle, spacing, phase, waveAmp, waveLen }` describes one parallel line family.
`hatchDistance(sys, x, y)` is the analytic distance to the nearest (waved) centerline — the `mod.hatch`
node's O(1) coverage test ([`nodes/hatch.node.ts`](../../src/engine/nodes/hatch.node.ts)). The
sampled path comes from `hatchFragments(scan)`: enumerate lines across the box's projected normal
extent, sample each centerline, clip against a caller-supplied `inside` test with bisection-refined
endpoints, and emit every maximal inside run as one constant-width closed evenodd strip
(`stripPath`). The texture hatch adapters ([`texture/hatch.ts`](../../src/engine/texture/hatch.ts))
are the region/field callers; budgets and knob mapping are described in
[texture](texture.md).

### Fill patterns — the `texture/fill*` split

The old single `fillpatterns.ts` module was split by concern; [`fill.ts`](../../src/engine/texture/fill.ts)
re-exports the other two so external imports are unchanged:

- [`fill-data.ts`](../../src/engine/texture/fill-data.ts) — the **catalog**: ids and UI data. `FillPatternId`
  (22 patterns), `FillGradient`, `FillHtShape`, `FillHtLattice`, the `FillStyle` settings object and
  `DEFAULT_FILL_STYLE`, plus UI-order lists `PATTERNS`, `GRADIENTS`, `HT_SHAPES` and the capability
  sets `SCALED_PATTERNS` / `GRAIN_PATTERNS`. Pure data, no math.
- [`fill-patterns.ts`](../../src/engine/texture/fill-patterns.ts) — the **math**: `patternAt(id, x, y, t, opts)`
  (per-cell A/B predicate), `gradientAt(g, x, y, seed, box)` (mix ratio), `screenPatternAt`
  (analytic halftone screen: grid/hex/rings arrangement, 8 silhouettes, jitter + noise-clustered
  dropout), `patternCoord(doc)` (buffer position of a cell; the square grid works at sub-cell
  resolution `bw = cols·sub`), and `PatternOpts`. Stateless and seeded (`hash2` local to the module).
- [`fill.ts`](../../src/engine/texture/fill.ts) — the **application**: `applyFillStyle(style, region, seed, coordOf)`
  walks the region once (computing the bounding `Box` for gradients) and returns `Map<index, 0|1>` —
  the per-cell A/B decision; `fillSelectionCells(doc, selection, style, colorA)` re-fills
  selection-owned cells keeping element ownership, anchoring radial gradients/concentric patterns at
  the selection bbox center.

Pattern families (`patternAt`): matrix patterns compare `t > thresholdAt(...)` (bayer2/4/8/16,
cluster, halftone, blue-noise, void-cluster); `screen` is a true rotated halftone screen (pitch
`6·scale`, tone → dot area through dot/square/diamond/line/ellipse-chain/star/heart/cross
silhouettes); `noise` = hashed block noise, `ign` = interleaved gradient noise
(`fract(52.9829189·fract(0.06711056x + 0.00583715y))`), both grain-sized; line-work patterns
(grid/hatch/stripes-h/v/diag/zigzag/dots/bricks/rings) grow band width with t and repeat every
`4·scale` cells (`SCALED_PATTERNS`); `glyph` renders a user-editable `GlyphTileSet` as the threshold
field ([glyphs](glyphs.md)); null set falls back to `t > 0.5`.

**Gradients** (`gradientAt`): `none` (fixed `density`), vertical, horizontal, diag, diag-inv, radial
(from the click seed; linear profiles normalize over the region's bounding span, radial divides by
the max corner distance).

Call order for a fill click (consumer [`src/state/fill.slice.ts`](../../src/state/fill.slice.ts)):
flood the seed's same-value region (`floodRegion`, [paint-tools](paint-tools.md)) → `patternCoord`
→ `applyFillStyle` → write `0|1` back as color A/B values. Live drag preview goes through the same
`patternAt` in [`features/tools/tool-preview.component.tsx`](../../src/features/tools/tool-preview.component.tsx).

## Data structures

- `FillStyle { mode, pattern, gradient, density, color2, scale, grain, htShape, htAngle, htJitter,
  htDropout, htLattice, glyphSet }` (default solid / bayer4 @ density 0.5 —
  [`fill-data.ts`](../../src/engine/texture/fill-data.ts)).
- `OrderedMatrix` — row-major rank matrix; read as `(rank + 0.5) / levels` via `thresholdAt`.
- `ScreenStyle { lattice, mark, mode, pitch, twist, seed }` and `ScreenPoint { x, y, n }`.
- `HatchScan` — the clip-and-emit contract: cover box, system, `widthAt(u, k)`, optional
  `jitterAt(k)`, `inside(x, y, hw)`, sampling `step`, `maxLines`/`maxRuns` budgets.

## Invariants & constraints

- Rank convention is 0-first (dark); matrices are positive-mod indexed so any integer coordinate tiles.
- Pattern math is pure and seeded (`hash2`) — identical output across canvas, preview and commit; no
  `Math.random`.
- `levels` per consumer is a visual baseline (see above), not an implementation detail.
- Halftone marks on non-grid lattices cap below touching so evenodd never XORs (both the fill screen
  and the texture lattices).

## Performance characteristics

`patternAt` is O(1) per cell with small constants (matrix lookup or one-two hash draws); pattern
fills are bounded by the fill region, not the canvas. [`dither.bench.ts`](../../src/engine/dither/dither.bench.ts)
pins per-algorithm import costs on a 128² sample (the dialog re-runs a conversion per slider tick);
[`texture/hatch.bench.ts`](../../src/engine/texture/hatch.bench.ts) covers the line-system path;
[`texture/fill.test.ts`](../../src/engine/texture/fill.test.ts) pins per-pattern outputs.

## Testing

- [`matrices.test.ts`](../../src/engine/dither/matrices.test.ts) — rank conventions, Bayer recursion.
- [`catalog.test.ts`](../../src/engine/dither/catalog.test.ts) — catalog closure, matrix/field
  conformance per import id, scan orders.
- [`screen-engine.test.ts`](../../src/engine/dither/screen-engine.test.ts) — lattice point layouts,
  screen masks, `mod.halftone`, fill screen lattices.
- [`screen-lines.test.ts`](../../src/engine/dither/screen-lines.test.ts) — `hatchDistance`,
  `stripPath`, `hatchFragments`.
- [`texture/fill.test.ts`](../../src/engine/texture/fill.test.ts) — per-pattern cells, gradients,
  halftone screen, `applyFillStyle`, `fillSelectionCells`; [`texture/glyph-fill.test.ts`](../../src/engine/texture/glyph-fill.test.ts)
  — the glyph pattern.

## Related decisions

- [image-import](image-import.md) — the other `thresholdAt`/fields consumer with different `levels`.
- [glyphs](glyphs.md) — the glyph pattern source.
- [texture](texture.md) — the texture hatch/lattice adapters built on this folder.

## OpenSpec capabilities

- `openspec/specs/drawing-tools/spec.md` (fill tool); in-flight: `openspec/changes/add-fill-patterns/`,
  `openspec/changes/add-dither-registry/`, `openspec/changes/add-halftone-screen-engine/`,
  `openspec/changes/add-line-systems/`

## Known limitations

- Two colors per fill (A/B) — no multi-color pattern fills.
- `screen` silhouette set is fixed (8 shapes); no custom halftone shapes in fills (the texture panel
  and `mod.halftone` reuse the 10-mark cell-form registry instead).
