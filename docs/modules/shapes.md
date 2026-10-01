# Shapes — technical notes

## Scope

The 22 shape tools (star, polygon, diamond, heart, spiral, arrow, lightning, moon, wave,
cross, flower, gear, sun, bento, zigzag, ring, arc, drop, chevron, concentric,
concentricRect, skull): normalized polyline generators, integer-cell rasterization, and the
interior/even-odd fill classification. Engine files under `src/engine/`; the drag interaction
lives in the staging hook ([canvas-stage](canvas-stage.md)).

## Module map

| File | Role |
|---|---|
| `src/engine/shape-tools.ts` | `ShapeToolId` (22), `SHAPE_TOOLS` rail order, `isShapeTool`, param partition |
| `src/engine/shapes.ts` | `shapePathSegments` / `shapePathPoints` / `shapePathLoops` facade |
| `src/engine/shape-util.ts` | `Polyline`, `clamp`, `rotated` |
| `src/engine/shape-box.ts` | unit-square box shapes: star, polygon, diamond, cross, lightning, heart, spiral, moon, flower, gear |
| `src/engine/shape-radial.ts` | sun, ring, arc, drop, chevron, concentric(Rect), skull dispatch |
| `src/engine/shape-bento.ts` | seeded bento layouts (mulberry32, union-find slot merging) |
| `src/engine/shape-skull.ts` | skull silhouette + hole loops (eyes, nose, teeth) |
| `src/engine/shape-decorate.ts` | shared `shapeCorner` rounding + `shapeBulge` post-decorators |
| `src/engine/shape-lines.ts` | Bresenham `linePoints`, `rectPoints`, superellipse `ellipsePoints`, `polylineCells` |
| `src/engine/shape-flow.ts` | drag-direction shapes: arrow, wave, zigzag |
| `src/engine/shapefill.ts` | outside-flood region classification + even-odd point tests |

## How it works

Per the `shape-tools.ts` header: "Box-filling shapes are defined as normalized polylines in
the unit square and scaled to the drag's bounding box; arrow and wave follow the drag
direction instead. The float polylines double as doc-space paths for the non-square grids."

Pipeline: drag → `shapePathSegments(tool, ax, ay, bx, by, opts, steps?)` (sample count
`n = max(32, min(512, ceil((w+h)·3)))`) → `polylineCells` (Bresenham between rounded
vertices, `"x,y"` map dedup) → integer-cell outline. Finite symmetry modes map the defining
points through every `symmetryTransforms` copy and **re-rasterize each copy** — every copy is
a correctly drawn shape, not a mirrored raster; repeat/wallpaper modes instead classify the
primary copy and expand kept cells through `symmetryPoints` orbits (capped
`max(64, MAX_STAMPS / tipOffsets.length)`).

**Fill** (`shapefill.ts` header): "The square grid flood-fills the outside around the outline
inside its bounding window (cells the flood never reaches are inside); other grids test cell
centers against the outline polylines with the even-odd rule." The flood starts from the
bounding box inflated by 1 cell — shapes touching the canvas border classify correctly and
cost stays proportional to the shape, not the canvas. Hole-bearing shapes (skull only —
`shapeHasHoles`) fill even-odd across loop entries with half-integer test points
(`x+0.5, y+0.5`) keeping boundary cells out.

## Data structures & notable params

- `Polyline = [number, number][]`; `shapePathLoops` returns one loop per polyline — union of
  loops equals `shapePathPoints`; even-odd fills run across entries.
- Param highlights: star rays 3–12 / inner 0.15–0.49; polygon sides 3–12; spiral turns
  0.5–6 ± direction; moon thickness = the *gap* between arcs; gear teeth 4–16 / depth;
  sun rays 3–32 + taper/wave/twist; bento cols/rows/gap/radius/inset/chaos/merge/seed;
  ellipse power (superellipse, 2 = circle); arrowHead 0.1–0.6 of drag length; wavePeriods
  1–8. Full lists: `shape-box.ts`, `shape-radial.ts`, `shape-flow.ts`.
- Skull: one closed silhouette + nested hole loops (even-odd), ~20 params (cranium, brow,
  jaw, mandible, eyes size/spacing/tilt/asym, nose shape, teeth count/shape).

## Invariants & constraints

- Bresenham guards: `linePoints` caps at 100k steps; seeded layouts (bento) must stay stable
  between frames → mulberry32 with explicit seed param.
- `concentric` radii have a default (`[1, 0.66, 0.33]`); `hasDefaultConcentricRadii` gates
  parametric-commit regeneration.
- Shape decoration order is fixed: bulge first, then corner rounding.

## Performance characteristics

Shape rasterization cost scales with the drag box (sampling) + stroke length (Bresenham);
`tools.bench.ts` covers shape stamping and `symmetryPoints` orbit costs. The expensive part
of a shape stroke is usually the symmetry orbit expansion, not the generator.

## Testing

`shapes.test.ts`, `shapes.skull.test.ts`, `shapefill.test.ts`; bench `tools.bench.ts`.

## Related decisions

- [symmetry](symmetry.md) — the two application paths (per-copy re-rasterization vs orbit
  expansion).

## OpenSpec capabilities

- `openspec/specs/drawing-tools/spec.md`, `openspec/specs/canvas-grid/spec.md`

## Known limitations

- Only the skull carries holes; other shapes are simple loops (even-odd ready if needed).
- Non-square grids consume the float polylines directly; their cell lookup is per-grid
  (`grid.cellAt`), no sub-cell equivalents.
