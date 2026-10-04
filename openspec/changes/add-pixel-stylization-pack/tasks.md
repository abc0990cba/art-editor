# Tasks: add-pixel-stylization-pack

## 1. Metaball super-pixels and fuse-all

- [x] 1.1 `MetaballSettings.unit` / `blockSize` / `fuseAll` / `strokeWidth` in the doc model,
      defaults, `normalizeMetaball` (parse + presets), project JSON, `elementStyleKey`,
      `sameMetaball`
- [x] 1.2 Per-source kernel radius (`MetaballSource.r` / `MetaballCapsule.r`) in
      `buildMetaballField`
- [x] 1.3 `collectBlockSources`: complete-block collapse with swollen kernels, adjacency
      capsules, per-cell fallback for incomplete/mixed blocks
- [x] 1.4 `fuseAll` dispatch bypass (`fusesAll` + `fusedSceneGeometry`) over the synced
      composite
- [x] 1.5 Style section knobs (unit chips, block size, fuse-all) + i18n (EN/RU)

## 2. Contour and extrude render modes

- [x] 2.1 `RenderMode` += `contour` / `extrude`; parse/preset validation; style node options
- [x] 2.2 `metaballPaths` fill/stroke split → `contourGeometry` (unfilled stroked loops,
      `metaball.strokeWidth`)
- [x] 2.3 `geometry/extrude.ts`: body mask, run-merged rect path before the fill, auto-darkest
      body color, ray stopping
- [x] 2.4 `geometry/mode.ts` shared mode dispatch (global / scene / element paths)
- [x] 2.5 `ExtrudeSettings` freeze/equality/style-key wiring; style section extrude knobs
      (depth, 8-way direction pad, body color swatches) + contour line width + i18n (EN/RU)
- [x] 2.6 `modes.test.ts`: contour stroke output (geometry + SVG), extrude body placement,
      occlusion, auto color, degenerate direction

## 3. Selection pixel ops

- [x] 3.1 `engine/effects/morpho.ts`: blockify / dilate / erode / pixelPerfect / despeckle /
      outlineOnly / silhouette / longShadow / scanlines (pure, deterministic)
- [x] 3.2 `morpho.test.ts`: per-op pixel-pattern fixtures (17 cases)
- [x] 3.3 `pixelOpSelection` in `effect.slice.ts` (recolor ops resolve the current color)
- [x] 3.4 Selection FX menu: pixel-op group, inline parameter rows, i18n (EN/RU)

## 4. New lattices

- [x] 4.1 `hexFlat` (odd-q flat-top) and `rhombille` (3 lozenges per pointy-top hex) builders
      + `GridType`/`GRID_TYPES`/coord labels
- [x] 4.2 Hex cube-rounding fix: `dz` precedence (`rz + qf + rf`) and the final `else` reset in
      all three hex-family builders
- [x] 4.3 `hex-rhombille.test.ts`: round-trips (in-face probes for rhombille), polygon bounds,
      adjacency symmetry + connectivity, hit probes, project round trip, rendering smoke,
      coord labels
- [x] 4.4 i18n grid names + descriptions (EN/RU)

## 5. Docs and gates

- [x] 5.1 `docs/modules/grids.md` lattice inventory + hit-test fix note
- [x] 5.2 `docs/modules/effects.md` pixel ops + render modes
- [x] 5.3 Full gate green (format / lint / arch / knip / tsc / test) after every part
