# Tasks: add-grid-types

## 1. Engine

- [x] 1.1 `grids.ts`: `GridType`, `Grid`, `makeGrid` (square/hex/triangle/radial), `cellAt`,
      generic edge-neighbor map, angle/radius symmetry helpers, `docSize`
- [x] 1.2 `outline.ts`: extract shared fillet emitter; generic polygon-boundary tracer
- [x] 1.3 `geometry.ts`: dispatch by grid type; rounded-polygon pixels; center-based metaball
- [x] 1.4 `doc.ts`/`project.ts`: `gridType` field, `docSize`, tolerant project load

## 2. Tools & UI

- [x] 2.1 `floodfill.ts`: neighbor-function parameter (edge adjacency on any grid)
- [x] 2.2 `store.ts`: `setGridType` with artwork conversion and link remapping
- [x] 2.3 `CanvasStage`: grid hit-testing, polygon hover/grid overlay, connectors by index,
      symmetry mapping + guides, fit by `docSize`
- [x] 2.4 `SettingsPanel`: grid-type selector; hide sub-cells/connectivity for non-square grids
- [x] 2.5 `i18n`: grid names EN/RU

## 3. Tests & polish

- [x] 3.1 `grids.test.ts`: hit-test round trips, neighbor counts, tiling bounds, conversion
- [x] 3.2 Geometry tests: hex outline merge, hex/radial metaball merge, pixels rounded hexagons,
      project round trip
- [x] 3.3 Browser smoke on all grids × styles; lint/tsc/vitest/build; archive
