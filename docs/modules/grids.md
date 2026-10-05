# Grids — technical notes

## Scope

The lattice system in [`src/engine/grids/`](../../src/engine/grids/index.ts): ten grid types, whole-grid
rotation, grid↔grid conversion — plus the cell-form registry in
[`src/engine/cell-shapes/`](../../src/engine/cell-shapes/index.ts) (28 forms a `pixels`-mode cell can take, on
square and non-square grids alike). Public entries: [`src/engine/grids/index.ts`](../../src/engine/grids/index.ts)
(`GridType`, `Grid`, `makeGrid`, `isPlainSquare`, `docSize`, `convertGridDoc`) and
[`src/engine/cell-shapes/index.ts`](../../src/engine/cell-shapes/index.ts) (the barrel every consumer imports).

## Module map

| File | Role |
|---|---|
| [`src/engine/grids/index.ts`](../../src/engine/grids/index.ts) | `Grid` interface, `makeGrid` re-export, `isPlainSquare`, `docSize`, `cellCoordLabel`, conversion: `gridConvertMap`/`convertLink`/`convertGridDoc` |
| [`src/engine/grids/lattice.ts`](../../src/engine/grids/lattice.ts) | `makeGrid` — the memoized lattice factory (`type:cols:rows:even:rot%360` cache) |
| [`src/engine/grids/coverage.ts`](../../src/engine/grids/coverage.ts) | `gridCoveragePoly` / `gridCoverageClip` — the drawable region of a plate (full rect / radial disc / turned rect) shared by backgrounds, exports and metaball clamps |
| [`src/engine/grids/builders.ts`](../../src/engine/grids/builders.ts) | `buildGrid` dispatch, `attachEdgeMap` (shared-edge adjacency), `makeSquare`, `makeHex` (pointy-top axial), `makeTriangle` (▲▼ bands), `makeRadial` (polar rings) |
| [`src/engine/grids/lattices.ts`](../../src/engine/grids/lattices.ts) | `buildLattice`: `makeSheared` (diamond/iso), `makeBrick` (running bond), `makeOctasquare` (truncated 4.8.8), `makeHexFlat` (flat-top odd-q), `makeRhombille` (3 lozenges per pointy-top hex) |
| [`src/engine/grids/geometry.ts`](../../src/engine/grids/geometry.ts) | `gridBuildGeometry` — pixels/outline/metaball for every non-square grid, `gridMetaballField` |
| [`src/engine/grids/rotate.ts`](../../src/engine/grids/rotate.ts) | `rotatedGrid(base, deg)` — geometry wrapper around any base lattice |
| [`src/engine/grids/polar.ts`](../../src/engine/grids/polar.ts) | `byAngle` — nearest cell by angle at equal radius (RING_TOL 0.75) |
| [`src/engine/cell-shapes/index.ts`](../../src/engine/cell-shapes/index.ts) | barrel: registry data + `cellShapeHit` + `cellShapeFragment`/`shapePreviewPath` |
| [`src/engine/cell-shapes/defs.ts`](../../src/engine/cell-shapes/defs.ts) | `CellShapeId` (28 ids), `ShapeParams { thickness, points, rotation }`, normalization |
| [`src/engine/cell-shapes/geom.ts`](../../src/engine/cell-shapes/geom.ts) | unit-box silhouettes + `cellShapeHit` (tone rasters) |
| [`src/engine/cell-shapes/ext.ts`](../../src/engine/cell-shapes/ext.ts) | extended-form silhouettes (everything after the classic twenty) + parametric generators |
| [`src/engine/cell-shapes/frag.ts`](../../src/engine/cell-shapes/frag.ts) | `cellShapeFragment` (form into a placed cell box), `shapePreviewPath` (picker icons) |

## How it works

A lattice is not stored geometry — it is per-cell closures over the flat index space:
`center(i)`, `polygon(i)`, `cellAt(x, y)` (hit-testing), `edgeNeighbors(i)`, `radiusOf`/
`angleOf`/`cellByAngle` (polar symmetry), optional `ringSectorOf` (radial only).
`edgeNeighbors` is derived generically (`attachEdgeMap` in
[`src/engine/grids/builders.ts`](../../src/engine/grids/builders.ts)): polygon edges are quantized to 1e-6 keys and
shared keys pair cells (degenerate edges and T-junction sub-edges special-cased) — one
implementation serves hex, hexFlat, triangle, rhombille, radial, diamond, iso, brick and
octasquare; square computes neighbors arithmetically.

`makeGrid` memoizes by `type:cols:rows:even:rot%360`
([`src/engine/grids/index.ts`](../../src/engine/grids/index.ts)). **Whole-grid rotation**
([`src/engine/grids/rotate.ts`](../../src/engine/grids/rotate.ts)) wraps a base lattice: centers and polygons rotate
around the canvas center (extent grows to the re-centered bounding box of the turned rect —
except radial, a circle, which keeps its base size), `cellAt` rotates the query point back
into base space, polar helpers shift angles by the same amount; adjacency is index-based on
the unrotated base and passes through untouched. Like the radial grid, a rotated lattice
still leaves the canvas corners uncovered — `cellAt` returns −1 there.

**Rendering** ([`src/engine/grids/geometry.ts`](../../src/engine/grids/geometry.ts)): `gridBuildGeometry` runs for every
grid where `isPlainSquare` is false (the header names the classic hex/triangle/radial, but
dispatch is generic — diamond/iso/brick/octasquare and rotated squares all land here). Per
color group: `pixels` → the native cell polygon (`roundedPolygonPath`; the radius is a
fraction of the cell's shortest true edge from `minCornerRun` — collinear splits and arc
runs merged, so hex at radius 0.5 rounds to a circle and a radial wedge to a leaf — sized by
`sizeX/Y`, tone-scaled, jittered) or a registered cell form via `cellShapeFragment` in the
cell's bounding box; `outline` → `traceSilhouette` (union boundary along shared polygon
edges, canonical 1e-6 keys) filleted by `emitFilletPath` from [geometry](geometry.md) — only
true corners fillet, arc samples and T-junction splits stay smooth; `metaball` →
`gridMetaballField` (kernel splats at cell centers, √-scaled by the local cell size so
sub-unit radial rings don't fuse into a saturated center blob, + link capsules, `step`
capped so the long side stays ≤ 600 nodes, radial fields clamped to the disc boundary) traced
by the shared field tracer. Connectors stroke between
`grid.center` endpoints. Corner connectivity and sub-cells are square-grid features.

**Grid conversion** ([`src/engine/grids/index.ts`](../../src/engine/grids/index.ts)): `gridConvertMap` samples every new
cell center (normalized old↔new extent) through `oldGrid.cellAt` to build the new→old index
map; `convertLink` maps both endpoints and drops collapsed/out-of-grid connectors;
`convertGridDoc` rebuilds `cells`/`cellObj`/`links` from the map. The scene-tree twin is
`convertedGridDoc` in [`src/engine/core/scene-resize.ts`](../../src/engine/core/scene-resize.ts).

**Cell forms** ([`src/engine/cell-shapes/defs.ts`](../../src/engine/cell-shapes/defs.ts)): 28 ids (square, circle, ring,
triangle, triangleDown, diamond, cross, xCross, star, sparkle, hexagon, heart, moon, teardrop,
flower, semicircle, gear, asterisk, lightning, chevron, pentagon, octagon, capsule, trapezoid,
shield, leaf, egg, arrow) with `ShapeParams { thickness 0.05–0.5, points 3–12, rotation
0–360 }`. Each form = unit silhouette ([`src/engine/cell-shapes/geom.ts`](../../src/engine/cell-shapes/geom.ts) or
[`src/engine/cell-shapes/ext.ts`](../../src/engine/cell-shapes/ext.ts)), a fragment builder in
[`src/engine/cell-shapes/frag.ts`](../../src/engine/cell-shapes/frag.ts), and hit support in `cellShapeHit`. Adding one =
a `CELL_SHAPES` entry + silhouette + fragment + 2 i18n keys.

## Data structures & hit-testing

- Hit-testing is O(1) exact per lattice (two floors for the sheared lattices, cube-rounding
  for hex / hexFlat / rhombille — rhombille then picks the 120° lozenge sector, nearest-center
  + cut test for octasquare) except triangle (per-band
  point-in-polygon) and radial (polar floor). `cellCoordLabel` renders human coordinates per
  lattice (hex axial `q:/r:`, octasquare `oct:`/`gap:`, radial `ring:/sector:`).
- Octasquare cell count = `cols·rows + (cols−1)(rows−1)` — gap squares are appended after
  octagons in index space (buffers can be bigger than `cols×rows`; the deserializer allocates
  the larger of the two, see [doc-and-scene](doc-and-scene.md)). Rhombille is compound the
  same way: `count = 3·cols·rows`, hex cell `h` owning lozenges `3h`, `3h+1`, `3h+2`.
- Radial `radialEven` grades sector counts per ring into halving bands so cell arc length
  stays close to ring thickness; arc polygons carry shared boundary samples so edge-key
  adjacency survives the ring transition. Each arc stop interval is subdivided adaptively
  (`max(4, ceil(interval / 8°))`) so every sample turn stays under the fillet core's corner
  threshold — coarse sectors and even-graded inner rings (down to the ring-0 half disc) never
  scallop; intervals ≤ 32° keep the old 4 samples and render byte-identical.
- `isPlainSquare(doc)` ([`src/engine/grids/index.ts`](../../src/engine/grids/index.ts)) gates every square-buffer fast
  path: selection moves, transforms, texture effects, connectivity, brush tips, repeat
  symmetry. A *rotated* square loses all of them and renders through the generic lattice
  paths.

## Invariants & constraints

- Sub-cells and corner connectivity are square-only (`changeSub`, outline/metaball corner
  modes).
- Grid conversion resamples per object via new-center → `oldGrid.cellAt` and remaps links by
  endpoints (dropping collapsed ones); on scene docs the same map fans object ink out through
  `remapTreeSample`.
- Cell-form hit tests exclude corner radius/chamfer (tone rasters need stable tests); ring's
  hole relies on renderer evenodd.
- Dependency note: [`src/engine/core/doc.ts`](../../src/engine/core/doc.ts) imports `docSize` (a value) from
  this folder, while grids-internal code refers back to `core/doc` type-only — the family
  stays a clean DAG.

## Performance characteristics

- Square fast paths exist precisely because per-cell closures are slower than flat indexing;
  rotated grids pay the generic price everywhere (see `isPlainSquare` above).
- [`src/engine/geometry/render-modes.bench.ts`](../../src/engine/geometry/render-modes.bench.ts) measures triangle-grid
  rebuild at 9.4 ms (512²) vs 5.8 ms square.
- Dense non-square grid *overlays* re-rasterize thousands of polygons per frame in the stage —
  caching idea recorded in `docs/research/performance.md` §5.

## Testing

- [`src/engine/grids/grids.test.ts`](../../src/engine/grids/grids.test.ts) — lattice geometry, non-square rendering,
  project round trips, `radialEven`, `cellCoordLabel`.
- [`src/engine/grids/geometry.test.ts`](../../src/engine/grids/geometry.test.ts) — cell forms on non-square grids.
- [`src/engine/grids/rotate.test.ts`](../../src/engine/grids/rotate.test.ts) — rotated grids (hit-testing, extent,
  symmetry helpers).
- [`src/engine/cell-shapes/cell-shapes.test.ts`](../../src/engine/cell-shapes/cell-shapes.test.ts) — registry integrity,
  fragment geometry, hit tests, params normalization, picker helpers.

## Related decisions

- [geometry](geometry.md) — dispatch order that routes non-square docs to `gridBuildGeometry`.

## OpenSpec capabilities

- `openspec/specs/grid-types/spec.md`, `openspec/specs/canvas-grid/spec.md`

## Known limitations

- No sub-cell support on non-square lattices (by design).
- Rotated grids leave canvas corners uncovered; non-radial rotated extents grow to the turned
  bounding box (canvas plates get larger, not cropped).
- `byAngle` symmetry lookup is O(count) per query — fine at editor grid sizes, worth noting
  before very dense radial grids.
