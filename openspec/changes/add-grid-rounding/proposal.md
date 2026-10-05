# Proposal: add-grid-rounding

## Why

Rounding was tuned for the square grid and degrades on every other lattice: corner arcs were
emitted with radius = tangent length, which is tangent-true only for 90° corners — hexagon
(120°), triangle (60°) and octagon (135°) corners got kinked arcs that collapse a rounded cell
field into a rosette/ring pattern. Outline mode filleted every silhouette vertex, including
exact-collinear split vertices (triangle base midpoints, radial arc T-junctions), producing
semicircular bumps whenever a concave radius was set, and scalloped every tiny arc-sample turn
on radial silhouettes. The per-cell radius scale (`radius × minEdge/2`) starved radial wedges
(minEdge crosses tiny arc chords → almost no visible rounding) and was inconsistent with the
square grid's radius semantics. Metaball kernels ignored local cell size, so sub-unit radial
inner rings fused into one saturated center blob while lone cells rendered ~4× oversize.

## What Changes

- Shared tangent-fillet core `filletPath` in `geometry/poly-path.ts`: every true corner (turn
  above ~10°) gets a circular arc tangent to both edges — radius `t/tan(θ/2)`, equal to `t` at
  90° so square-grid output stays byte-identical. Vertices turning less than ~10° (collinear
  splits, arc samples) pass through unrounded.
- `emitFilletPath` (outline mode) delegates to the shared core: same tangency, plus the turn
  threshold that removes collinear-split bumps and radial-arc scallops.
- Corner-to-corner clamping: tangent lengths clamp against the whole edge run to the
  neighboring corners (arc samples included), so curved runs no longer starve fillets.
- Grid-aware radius base `minCornerRun` in the non-square pixel path: radius is a fraction of
  the cell's shortest true edge — hex at 50% rounds to a circle, a radial wedge to a leaf,
  matching the square presets.
- Metaball splats on non-square grids scale with the local cell size (√ of the shortest true
  edge): sub-unit radial rings render proportionate blobs, same-ring neighbors keep merging
  gooey-ly (adjacent sectors still form one blob).
- `.oxlintrc.jsonc`: outline.ts ratchet shrunk (complexity override removed — the fillet body
  moved to poly-path.ts; max-params 8 → 7).
- Tests: tangency property tests (hexagon/triangle/split-base/pie-slice), per-grid structural
  tests for all 10 lattices (fillet counts, exact tangent radii, no bumps at splits, radial
  wedge scale), metaball splat-scaling test.

## Capabilities

### Modified

- `pixel-styling` — ADDED requirement: grid-aware rounding (per-grid radius base, true-corner
  filleting on every lattice). MODIFIED requirement: direction-invariant rounding extended with
  tangency and run-aware clamping.
- `metaball-rendering` — ADDED requirement: local-size metaball splats on non-square grids.

## Non-Goals

- True-arc path representation for silhouette arcs (sampled chords stay — invisible at current
  sampling density)
- Per-corner radii on non-square grids (stay square-only)
- Metaball capsule scaling (connector strokes keep unit kernels)
- Corner styles for metaball blobs
