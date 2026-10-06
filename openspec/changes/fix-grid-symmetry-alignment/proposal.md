# Proposal: fix-grid-symmetry-alignment

## Why

On every non-square lattice the finite symmetry modes (mirrors, 4-way, diagonal, and the rosette
center) resolved copies through a polar angle scan (`cellByAngle`: radius bucket + nearest angle)
about the raw canvas middle. That middle is never a mirror axis of the hex lattices — the pointy-top
bounding box is half-step asymmetric (`w = √3·(cols + 0.5)`), so mirrored copies always landed
between cells, jagged and pairing differently per row. Worse, `cellByAngle` excludes the source
cell, so a cell sitting exactly on an axis — the user's "central object on the border of symmetry"
— was assigned a spurious partner instead of mapping to itself, and radius-bucket ties could pick
cells in neighboring rows. The result depended on which side you painted from.

## What Changes

- `effects/symmetry-grid.ts` (new): grid-aware symmetry for non-square lattices.
  - `symmetryAxes` snaps the canvas-middle mirror axes to the nearest lattice mirror axis, found
    by a 2D probe (reflect probed cell centers; keep candidates whose images land back on centers
    or outside the grid). Hex/hexFlat/brick/diamond/iso/octasquare and the vertical axes of
    triangle/rhombille gain exact involutive mirrors; square and radial keep the exact middle.
  - `rotationCenter` snaps the rosette center to the nearest cell center, so N-fold rotations
    that are lattice automorphisms (hex family at 6-fold N) map centers exactly onto centers.
  - Copies map the cell's polygon centroid through the isometry and read the owner via `cellAt`;
    results are memoized per grid and copy, and involutive copies complete themselves
    symmetrically (i→j forces j→i) — axis cells map to themselves and pairs resolve the same from
    either side. Lattices without a given axis (triangle/rhombille horizontal) fall back to the
    nearest center line and stay deterministic.
- `features/canvas/use-canvas-staging.hook.ts`: `expand`/`polarPairs` use the new orbit/pair
  functions for non-square grids; the square buffer path is unchanged.
- `features/canvas/canvas-stage.util.ts`: symmetry guides draw at the same snapped axes and
  rosette center the math uses (`drawGuides` resolves them from the doc grid).
- Removed: `effects/symmetry.ts` `polarAngleMaps`, `grids/polar.ts` (`byAngle`) and the
  `cellByAngle` member of the `Grid` interface (builders, lattices, rotate wrapper).
- Tests: `effects/symmetry-grid.test.ts` — axis snapping, involutive mirrors across ten lattices,
  on-axis self-mapping, approximate-axis determinism, 6-fold rotation closure on hex, radial wedge
  gate, pair copies.

## Capabilities

### Modified

- `symmetry` — MODIFIED requirement: Grid support matrix (lattice-aligned axes, geometric
  cell maps, on-axis self-symmetry, rosette center on a lattice point, guides matching the math).

## Non-Goals

- Square-grid symmetry (buffer math already exact) and repeat/wallpaper modes (square-only) stay
  on `symmetryPoints`/`symmetryPairPoints`.
- Renaming or repositioning modes in the UI: diagonal 8-way keeps its 45° semantics on lattices
  where that axis does not exist lattice-exact — copies snap cell-wise.
- Improving the settings-panel demo preview (deliberately an abstract square grid).
