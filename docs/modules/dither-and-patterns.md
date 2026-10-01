# Dither & patterns — technical notes

## Scope

The shared ordered-dither threshold matrices (`dither-matrices.ts`) and the fill tool's
pattern library (`fillpatterns.ts` / `fillpatterns-data.ts`): two-color textures and dithered
gradients per cell. The *image-import* dithering pipeline is a separate consumer of the same
matrices — see [image-import](image-import.md).

## Module map

| File | Role |
|---|---|
| `src/engine/dither-matrices.ts` | `BAYER2/4/8/16`, `CLUSTER4`, `HALFTONE4`, `BLUE_NOISE8`, `VOID_CLUSTER8`, `PATTERN8`, `thresholdAt`, `crosshatchAt` |
| `src/engine/fillpatterns.ts` | `patternAt`, `gradientAt`, `applyFillStyle`, `FillStyle`, `fillSelectionCells` |
| `src/engine/fillpatterns-data.ts` | pattern catalog data |

## How it works

**Matrices** (header): "Every matrix is stored in the canonical rank convention (0 = the
first threshold to flip, so low ranks map to dark tones) and read through `thresholdAt()` into
a 0..1 comparison value: a pixel tone t picks the second palette color when
`t > thresholdAt(x, y)`." Bayer 4/8/16 are generated recursively (`prev·4 + BAYER2[quadrant]`).
`levels` is **caller-supplied** and intentionally differs per consumer (Bayer n uses n²;
blue-noise uses 16; PATTERN8 uses 32 in import) — do not "unify" without checking both
consumers' visual baselines.

**Fill patterns** (header): "A pattern decides per cell between the active color (A) and a
second color (B); a transition profile sets the mix ratio t per position, so the same
patterns double as flat textures (flat) or dithered gradients." 22 patterns in UI order:
bayer2/4/8/16, cluster, halftone, screen, blue-noise, void-cluster, noise, ign, checker, grid,
hatch, stripes-h/v/diag, zigzag, dots, bricks, rings, glyph.

- Matrix-based patterns compare `t > thresholdAt(...)`; `screen` is a true rotated halftone
  screen (pitch `6·scale`, tone → dot area through one of 8 silhouettes — dot, square,
  diamond, line, chain-dot ellipse, star, heart, cross — with jitter and dropout knobs).
- `noise` = hashed block noise; `ign` = interleaved gradient noise
  (`fract(52.9829189·fract(0.06711056x + 0.00583715y))`), both grain-sized.
- Line-work patterns (grid/hatch/stripes/zigzag/dots/bricks/rings) grow band width with t;
  tiles repeat every `4·scale` cells.
- `glyph` renders a user-editable `GlyphTileSet` as the threshold field
  ([glyphs](glyphs.md)); null set falls back to `t > 0.5`.

**Gradients** (`gradientAt`): `none` (fixed density), vertical, horizontal, diag, diag-inv,
radial (from the click seed). Linear profiles normalize over the bounding span; radial divides
by the max corner distance. `applyFillStyle` produces `Map<index, 0|1>` — the per-cell A/B
decision the fill tool paints.

## Data structures

- `FillStyle { mode, pattern, gradient, density, color2, scale, grain, htShape, htAngle,
  htJitter, htDropout, glyphSet }` (default bayer4 @ density 0.5).
- `patternCoord(doc)`: square grids work at sub-cell resolution (`bw = cols·sub`).
- `fillSelectionCells` re-fills selection-owned cells keeping element ownership; the radial
  seed is the selection bbox center.

## Invariants & constraints

- Rank convention is 0-first (dark); matrices are positive-mod indexed so any integer
  coordinate tiles.
- Pattern math is pure and seeded (`hash2`) — identical output across canvas, preview and
  commit; no `Math.random`.

## Performance characteristics

`patternAt` is O(1) per cell with small constants (matrix lookup or one-two hash draws);
pattern fills are bounded by the fill region, not the canvas. `tools.bench.ts` covers fill
stamping costs; `fillpatterns.test.ts` pins per-pattern outputs.

## Testing

`dither-matrices.test.ts` (rank conventions, recursion), `fillpatterns.test.ts` (per-pattern
cells, gradients, selection refill).

## Related decisions

- [image-import](image-import.md) — the other `thresholdAt` consumer with different `levels`.
- [glyphs](glyphs.md) — the glyph pattern source.

## OpenSpec capabilities

- `openspec/specs/drawing-tools/spec.md` (fill tool); in-flight: `openspec/changes/add-fill-patterns/`

## Known limitations

- Two colors per fill (A/B) — no multi-color pattern fills.
- `screen` silhouette set is fixed (8 shapes); no custom halftone shapes.
