# Tasks: fix-grid-symmetry-alignment

## 1. Engine

- [x] 1.1 `effects/symmetry-grid.ts` (new): `symmetryAxes` — candidate comb from cell-center
      coordinates + neighbor midpoints, 2D exactness probe (reflect probed centers, `cellAt`
      owner check, out-of-span images allowed), nearest-to-middle pick with larger-candidate ties
- [x] 1.2 `effects/symmetry-grid.ts`: `rotationCenter` — axes intersection snapped to the
      nearest cell center for non-square lattices
- [x] 1.3 `effects/symmetry-grid.ts`: per-mode isometries (mirrors/quad about the axes, diag8 as
      the 7 other D4 elements, radial/kaleido rotations about the rosette center with twist),
      centroid mapping through `cellAt`, memoized maps with symmetric completion for involutive
      copies, `gridSymmetryOrbit` (radial wedge gate included) and `gridSymmetryPairs`

## 2. Wiring

- [x] 2.1 `features/canvas/use-canvas-staging.hook.ts`: `expand`/`polarPairs` delegate to
      `gridSymmetryOrbit`/`gridSymmetryPairs` for non-square grids
- [x] 2.2 `features/canvas/canvas-stage.util.ts`: `drawGuides` resolves axes + rosette center
      from the doc grid; axis, diagonal, spoke and circle guides draw there
- [x] 2.3 Remove `polarAngleMaps` (`effects/symmetry.ts`), `grids/polar.ts` and the `cellByAngle`
      grid member (builders, lattices, rotate wrapper)

## 3. Tests

- [x] 3.1 `effects/symmetry-grid.test.ts`: axis snapping values (hex odd/even parity, square
      exact middle), involutive mirrors across ten lattices, deterministic fallbacks for
      triangle/rhombille horizontal, on-axis self-orbit, D4 copy counts, 6-fold rotation closure
      on hex, radial wedge gate, pair endpoint mapping
- [x] 3.2 `grids.test.ts`/`rotate.test.ts`: drop `cellByAngle` assertions; rotated radial orbit
      radius preservation through the new orbit
