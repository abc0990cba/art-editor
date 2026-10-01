# Grids — technical notes

## Scope

The lattice system: eight grid types, whole-grid rotation, grid↔grid conversion, and the
cell-form registry (28 shapes a square cell can take). Files: `src/engine/grids.ts` (facade),
`grids-builders.ts`, `grids-lattices.ts`, `grid-geometry.ts` (non-square rendering),
`grid-polar.ts`, `grid-rotate.ts`, `cell-shape-defs/-geom/-ext/-frag.ts`.

## Module map

| File | Role |
|---|---|
| `src/engine/grids.ts` | `Grid` interface, `makeGrid` (memoized), `isPlainSquare`, conversion helpers, `cellCoordLabel` |
| `src/engine/grids-builders.ts` | `makeSquare`, `makeHex` (pointy-top axial), `makeTriangle` (▲▼ bands), `makeRadial` (polar rings) |
| `src/engine/grids-lattices.ts` | `makeSheared` (diamond/iso), `makeBrick` (running bond), `makeOctasquare` (truncated 4.8.8) |
| `src/engine/grid-geometry.ts` | `gridBuildGeometry` — pixels/outline/metaball for non-square grids |
| `src/engine/grid-polar.ts` | `byAngle` — nearest cell by angle at equal radius (RING_TOL 0.75) |
| `src/engine/grid-rotate.ts` | `rotatedGrid(base, deg)` wrapper |
| `src/engine/cell-shape-*.ts` | 28-form registry: defs, silhouettes/hit tests, ext shapes, SVG fragments |

## How it works

A lattice is not stored geometry — it is per-cell closures over the flat index space:
`center(i)`, `polygon(i)`, `cellAt(x, y)` (hit-testing), `edgeNeighbors(i)`, `radiusOf`/
`angleOf`/`cellByAngle` (polar symmetry), optional `ringSectorOf` (radial only).
`edgeNeighbors` is derived generically (`attachEdgeMap`): polygon edges are quantized to 1e-6
keys and shared keys pair cells — one implementation serves hex, triangle, radial, diamond,
iso, brick and octasquare; square computes neighbors arithmetically.

`makeGrid` memoizes by `type:cols:rows:even:rot%360`. **Whole-grid rotation**
(`grid-rotate.ts` header) wraps a base lattice: geometry rotates around the canvas center,
`cellAt` rotates the query point back into base space, polar helpers shift angles by the same
amount; adjacency is index-based on the unrotated base; *the canvas extent stays the base
rect — corners are simply uncovered*, like the radial grid.

**Rendering** (`grid-geometry.ts` header): "Rendering for non-square grids (hex / triangle /
radial). All pixel styles are supported: rounded native cell polygons, the registered cell
forms, generic union-silhouette outline tracing, and center-kernel metaball fields. Corner
connectivity and sub-cells are square-grid features."

**Cell forms** (`cell-shape-defs.ts`): 28 ids (square, circle, ring, triangle, triangleDown,
diamond, cross, xCross, star, sparkle, hexagon, heart, moon, teardrop, flower, semicircle,
gear, asterisk, lightning, chevron, pentagon, octagon, capsule, trapezoid, shield, leaf, egg,
arrow) with `ShapeParams { thickness 0.05–0.5, points 3–12, rotation 0–360 }`. Each form =
unit silhouette (`cell-shape-geom.ts`), optional ext shape (`-ext.ts`), SVG fragment builder
(`-frag.ts`). Adding one = a `CELL_SHAPES` entry + silhouette + fragment + 2 i18n keys.

## Data structures & hit-testing

- Hit-testing is O(1) exact per lattice except triangle (per-band point-in-polygon) and
  radial (polar floor). `cellCoordLabel` renders human coordinates per lattice (hex axial
  `q:/r:`, octasquare `oct:`/`gap:`, radial `ring:/sector:`).
- Octasquare cell count = `cols·rows + (cols−1)(rows−1)` — gap squares are appended after
  octagons in index space (buffers can be bigger than `cols×rows`; the deserializer knows).
- `isPlainSquare(doc)` (header quoted in `grids.ts:78`) gates every square-buffer fast path:
  selection moves, transforms, texture effects, connectivity, brush tips, repeat symmetry. A
  *rotated* square loses all of them and renders through the generic lattice paths.

## Invariants & constraints

- Sub-cells and corner connectivity are square-only (`changeSub`, outline/metaball corner
  modes).
- Grid conversion (`convertGridDoc`) resamples per object via new-center → `oldGrid.cellAt`
  and remaps links by endpoints (dropping collapsed ones).
- Cell-form hit tests exclude corner radius/chamfer (tone rasters need stable tests); ring's
  hole relies on renderer evenodd.

## Performance characteristics

- Square fast paths exist precisely because per-cell closures are slower than flat indexing;
  rotated grids pay the generic price everywhere (see `isPlainSquare` above).
- `render-modes.bench.ts` measures triangle-grid rebuild at 9.4 ms (512²) vs 5.8 ms square.
- Dense non-square grid *overlays* re-rasterize thousands of polygons per frame in the stage —
  caching idea recorded in `docs/research/performance.md` §5.

## Testing

`grids.test.ts`, `grid-geometry.test.ts`, `grid-rotate.test.ts`, `cell-shapes.test.ts`.

## Related decisions

- [geometry](geometry.md) — dispatch order that routes non-square docs to `gridBuildGeometry`.

## OpenSpec capabilities

- `openspec/specs/grid-types/spec.md`, `openspec/specs/canvas-grid/spec.md`

## Known limitations

- No sub-cell support on non-square lattices (by design, documented in `grid-geometry.ts`).
- Rotated grids leave canvas corners uncovered (extent = base rect).
