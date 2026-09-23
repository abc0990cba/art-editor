# Proposal: add-grid-types

## Why

The editor is hardwired to a square lattice. Radial (polar), hexagonal and triangular grids are
classic bases for glyph and ornament drawing — especially combined with the existing symmetry,
metaball and outline rendering. Adding a grid abstraction lets the same tools (paint, shapes,
connectors, symmetry, export) work over other cell geometries.

## What Changes

- Add `Doc.gridType: 'square' | 'hex' | 'triangle' | 'radial'` (default `square`) with a grid
  abstraction (`src/engine/grids.ts`) providing per-cell centers, polygons, point→cell hit
  testing, canvas extent and edge-neighbor maps (derived generically from shared polygon edges).
- `cols`/`rows` keep per-grid meaning: hex/triangle — columns × rows of cells; radial — sectors ×
  rings. Switching grid type converts the artwork by sampling the old grid at each new cell
  center; resizing a non-square grid resamples likewise. Sub-cells (×2/×3) and connectivity
  (corner modes) remain square-grid features and are disabled for other grids.
- Rendering in all three pixel styles:
  - Pixels: each cell renders as a rounded polygon (hexagon, triangle, radial sector, square)
    honoring radius, chamfer/arc style and X/Y stretch.
  - Outline: a generic boundary tracer chains the exposed polygon edges of same-color cells into
    silhouettes with the existing convex/concave fillets or chamfers (replaces marching squares
    for non-square grids; marching squares stays for square).
  - Metaball: field kernels at cell centers — grid-independent; blobs merge across the lattice.
- Connectors link cell centers (indices stored); eraser, flood fill (edge-adjacency) and
  eyedropper work per grid.
- Symmetry for non-square grids: none, radial N-fold and kaleidoscope (angle-based mapping over
  cell centers with radius buckets); square keeps all seven modes. Guides render for the
  supported modes.
- Project JSON gains `gridType` with tolerant load; canvas extent is grid-derived for view fit,
  SVG viewBox and PNG export.

## Capabilities

### Modified

- New capability `grid-types` — ADDED requirements for grid selection, per-grid rendering,
  conversion, and tool behavior.
- `drawing-tools` — connectivity control is square-only (already spec'd); fill follows edge
  adjacency of the active grid.

## Non-Goals

- Sub-cell detail on non-square grids
- Corner connectivity (pinch/bridge) on non-square grids (all hex neighbors are edge neighbors;
  triangle/radial adjacency is handled by edge connectivity)
- Outline mode's marching-squares saddle semantics on non-square grids (generic tracer uses
  edge connectivity only)
