# Design: add-grid-types

## Grid abstraction (`src/engine/grids.ts`)

```ts
export type GridType = 'square' | 'hex' | 'triangle' | 'radial'
export interface Grid {
  type: GridType
  w: number; h: number          // canvas extent (doc units)
  count: number
  center(i: number): Pt
  polygon(i: number): Pt[]
  cellAt(x: number, y: number): number      // -1 when outside
  edgeNeighbors(i: number): number[]
  angleOf(i: number): number; radiusOf(i: number): number
  cellByAngle(i: number, targetAngle: number): number  // symmetry mapping
}
export function makeGrid(type: GridType, cols: number, rows: number): Grid
```

- **square** — delegates to the existing lattice math (`count = cols·rows`, axis-aligned squares,
  4-neighbors); keeps backward compatibility for all current code paths.
- **hex** (pointy-top, R = 1): column step √3, row step 1.5, odd rows offset √3/2; `cellAt` via
  axial-cube rounding; 6 edge neighbors; polygon = 6 vertices at 30°+60°k.
- **triangle** (side s = 1): bands of height √3/2; cell `i` in row `j` alternates up/down by
  `(i + j) % 2`; base index `k = i >> 1`; `cellAt` resolves band + half-column + point-in-triangle
  (with neighbor snapping); 3 edge neighbors.
- **radial** — canvas is a square of side `2·rows + 2`, center at the middle, outer radius
  `rows + 0.5`? (kept ≤ side/2); ring = `rows` bands of thickness 1 (scaled), sector = `2π/cols`;
  arcs approximated with 4 subdivision points per arc edge (shared endpoints between neighbor
  cells keep the edge map exact); `cellAt` = atan2 + radius.

Edge neighbors are derived generically once per grid: each cell contributes its polygon edges
quantized to 1e-6 into a map; an edge owned by two cells links them (3–6 neighbors per cell).

## Geometry dispatch

`buildGeometry` keeps the square pipelines untouched and adds a generic branch for other grids:

- **pixels**: per color group, each cell emits `roundedPolygonPath(polygon, r, chamfer)` —
  generic corner fillets (turn-angle threshold 10° so arc-sampling vertices on radial cells stay
  smooth); the polygon is scaled by `sizeX/sizeY` about its centroid.
- **outline**: per color group, a generic tracer — boundary edges are edges whose owner is the
  group and whose partner is missing/different; edges chain into closed loops by endpoint keys;
  loops pass through the same fillet/chamfer emitter as marching-squares outlines (convexity by
  majority turn sign).
- **metaball**: field over the canvas bbox with step scaled to ≤ 600 samples on the long side;
  Wyvill kernels at group cell centers and connector capsules; marching squares as today. No
  junction kernels (corner connectivity is square-only).

The fillet emitter is extracted from `outline.ts` into an exported shared function.

## Tools

- `cellAt` drives hit-testing (square keeps the fast division path).
- Connectors on non-square grids store cell indices in `ax`/`bx` (`ay`/`by` = 0); capsules join
  `grid.center` endpoints; eraser hit-test uses the same centers.
- Flood fill takes a neighbor function; square keeps the 4-direction BFS, other grids use
  edge neighbors.
- Symmetry: square keeps all modes via `symmetryPoints`; other grids use `none | radial |
  kaleido` mapped through cell centers: radius buckets (rounded distance from canvas center) and
  target angle `θ + 2πk/n` resolved by `cellByAngle`. Guides: spokes/circle for radial/kaleido.

## Document & projects

`Doc.gridType` (default `square`). `docSize(doc)` returns per-grid extent (square: cols×rows).
`setGridType` and non-square resize convert cells by sampling the old grid at new cell centers
(value 0 outside); links remap endpoints through `cellAt` and drop when both ends collapse to
one cell. Switching to a non-square grid resets `sub` to 1. Project JSON gains `gridType` with
`square` fallback; buffer length must match the grid cell count.

## Testing

`grids.test.ts`: hex/triangle/radial — cell-count, `cellAt(center(i)) === i` round trip for all
cells, interior neighbor counts (hex 6, triangle 3), tiling bounds. `geometry` tests: hex pair
outline merges to one loop; metaball merges on hex/radial; pixels rounded hexagons have arcs.
Project round trip with `gridType: 'hex'`. Browser smoke: draw on each grid, all three styles,
connectors, symmetry, export.
