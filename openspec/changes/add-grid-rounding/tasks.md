# Tasks: add-grid-rounding

## 1. Engine

- [x] 1.1 `geometry/poly-path.ts`: `filletPath` tangent-fillet core (turn threshold, run-aware
      clamping, run-interpolated tangent points, seam-safe walk), `roundedPolygonPath` wrapper,
      `minCornerRun` rounding base
- [x] 1.2 `geometry/outline.ts`: `emitFilletPath` delegates to the shared core; complexity
      ratchet override removed from `.oxlintrc.jsonc` (max-params 8 → 7)
- [x] 1.3 `grids/geometry.ts`: pixels-mode radius base = `radius × minCornerRun`; metaball
      splats √-scaled by the local cell size

## 2. Tests

- [x] 2.1 `geometry/poly-path.test.ts`: 90° byte-compat, hexagon tangency + radius formula,
      split-base pass-through, chamfer tangent-point parity, arc-run consumption,
      `minCornerRun` semantics
- [x] 2.2 `grids/geometry.test.ts`: per-grid fillet counts (all 10 lattices), radius 0 plain
      polygons, radial wedge scale, hex circle preset, triangle outline no-bump, radial outline
      true-corner-only, hex pair convex/concave split, metaball splat scaling
- [x] 2.3 Existing suites green unmodified (square-grid byte compatibility)

## 3. Docs & polish

- [x] 3.1 `docs/modules/geometry.md`: tangent-fillet algorithm note, module map
- [x] 3.2 `docs/modules/grids.md`: grid-aware radius base, outline true-corner filleting,
      metaball splat scaling
- [x] 3.3 Full check chain green (format/lint/arch/knip/tsc/test); browser spot-check of hex,
      triangle, radial in pixels + outline modes
