# Shapes — technical notes

## Scope

The 22 shape tools (star, polygon, diamond, heart, spiral, arrow, lightning, moon, wave, cross,
flower, gear, sun, bento, zigzag, ring, arc, drop, chevron, concentric, concentricRect, skull):
normalized polyline generators, integer-cell rasterization, and the interior/even-odd fill
classification. Everything lives in [`src/engine/shapes/`](../../src/engine/shapes/index.ts); the
drag interaction lives in the staging hook ([canvas-stage](canvas-stage.md)).

## Module map

| File | Role |
|---|---|
| [`src/engine/shapes/tools.ts`](../../src/engine/shapes/tools.ts) | `ShapeToolId` (22), `SHAPE_TOOLS` rail order, `isShapeTool`, the `ShapeOpts` param partition (box/radial/flow/skull knobs) |
| [`src/engine/shapes/index.ts`](../../src/engine/shapes/index.ts) | facade `shapePathSegments` / `shapePathPoints` / `shapePathLoops`, `shapeHasHoles` |
| [`src/engine/shapes/util.ts`](../../src/engine/shapes/util.ts) | `Polyline`, `clamp`, `clampInt`, `rotated` (unit-square rotation) |
| [`src/engine/shapes/box.ts`](../../src/engine/shapes/box.ts) | `boxShapePolylines` dispatcher; faceted unit-square outlines: star, polygon, diamond, cross, lightning, heart, spiral, moon, flower, gear |
| [`src/engine/shapes/radial.ts`](../../src/engine/shapes/radial.ts) | `radialPolylines`: sun, ring, arc, drop, chevron, concentric(Rect), bento, skull dispatch; `DEFAULT_CONCENTRIC_RADII`, `hasDefaultConcentricRadii` |
| [`src/engine/shapes/flow.ts`](../../src/engine/shapes/flow.ts) | drag-direction shapes: `arrowPolylines`, `wavePolylines`, `zigzagPolylines` |
| [`src/engine/shapes/lines.ts`](../../src/engine/shapes/lines.ts) | Bresenham `linePoints`, `rectPoints`, superellipse `ellipsePoints`, `polylineCells` rasterizer |
| [`src/engine/shapes/decorate.ts`](../../src/engine/shapes/decorate.ts) | shared `decoratePolylines`: `shapeBulge` (`bulgePolyline`) then `shapeCorner` rounding (`roundedPolyline`/`roundedRectPolyline`) |
| [`src/engine/shapes/bento.ts`](../../src/engine/shapes/bento.ts) | `bentoSlots` — seeded bento layouts (mulberry32 PRNG, row/col span merging) |
| [`src/engine/shapes/skull.ts`](../../src/engine/shapes/skull.ts) | `skullPolylines` — silhouette + hole loops (eyes, nose, teeth), quadratic-Bézier construction |
| [`src/engine/shapes/fill.ts`](../../src/engine/shapes/fill.ts) | interior classification: `regionCells` (outside-flood), `fillCellsEvenOdd` + `pointInPolys` (even-odd tests) — renamed from `shapefill.ts` |

Tests: [`shapes.test.ts`](../../src/engine/shapes/shapes.test.ts),
[`shapes.skull.test.ts`](../../src/engine/shapes/shapes.skull.test.ts),
[`fill.test.ts`](../../src/engine/shapes/fill.test.ts); bench
[`src/engine/paint/tools.bench.ts`](../../src/engine/paint/tools.bench.ts).

## How it works

Per the [`tools.ts`](../../src/engine/shapes/tools.ts) header: "Box-filling shapes are defined as
normalized polylines in the unit square and scaled to the drag's bounding box; arrow and wave follow
the drag direction instead. The float polylines double as doc-space paths for the non-square grids,
which sample them through their own cell lookup."

Step by step, in call order:

1. **Segments.** `shapePathSegments(tool, ax, ay, bx, by, opts, steps?)` in
   [`index.ts`](../../src/engine/shapes/index.ts) routes: arrow/wave/zigzag to
   [`flow.ts`](../../src/engine/shapes/flow.ts) (drag-direction builders), everything else to
   `boxShapePolylines(tool, opts, n)` scaled from the unit square into the drag box. Sample count
   `n = max(32, min(512, ceil((w+h)·3)))` unless the caller pins `steps`.
2. **Dispatch inside the box family.** [`box.ts`](../../src/engine/shapes/box.ts) splits `BoxShapeId`
   into facets (star, polygon, diamond, cross, lightning, heart, spiral, moon, flower, gear —
   generated point lists rotated by `rotated`) and the radial/composite builders:
   [`radial.ts`](../../src/engine/shapes/radial.ts) (sun, ring, arc, drop, chevron, concentric,
   concentricRect), [`bento.ts`](../../src/engine/shapes/bento.ts) (seeded slot layout) and
   [`skull.ts`](../../src/engine/shapes/skull.ts). Finished polylines pass through
   `decoratePolylines` ([`decorate.ts`](../../src/engine/shapes/decorate.ts)) — bulge first, then
   corner rounding.
3. **Rasterization.** `shapePathPoints` maps the polylines through `polylineCells`
   ([`lines.ts`](../../src/engine/shapes/lines.ts)): round each vertex, Bresenham-trace between
   consecutive vertices (`linePoints`, 100k-step guard), dedupe via an `"x,y"` map → integer-cell
   outline. `shapePathLoops` rasterizes each polyline separately (one loop per entry; the union over
   entries equals `shapePathPoints`).
4. **Fill classification** ([`fill.ts`](../../src/engine/shapes/fill.ts), header): "The square grid
   flood-fills the outside around the outline inside its bounding window (cells the flood never
   reaches are inside); other grids test cell centers against the outline polylines with the even-odd
   rule." `regionCells(outline, bw, bh)` starts the outside flood from the bounding box inflated by
   1 cell — shapes touching the canvas border classify correctly and cost stays proportional to the
   shape, not the canvas. Hole-bearing shapes (skull only — `shapeHasHoles`) fill via
   `fillCellsEvenOdd(loops, bw, bh)`: even-odd `pointInPolys` with half-integer test points
   (`x+0.5, y+0.5`) keeping boundary cells out; the caller stamps outline cells separately.
5. **Symmetry.** Finite symmetry modes map the defining points through every `symmetryTransforms`
   copy and **re-rasterize each copy** — every copy is a correctly drawn shape, not a mirrored
   raster; repeat/wallpaper modes instead classify the primary copy and expand kept cells through
   `symmetryPoints` orbits (capped `max(64, MAX_STAMPS / tipOffsets.length)`). See
   [symmetry](symmetry.md).

## Data structures & notable params

- `Polyline = [number, number][]`; `ShapeRegion { inside, outside }` — outline cells excluded from
  both sets.
- Param highlights ([`ShapeOpts`](../../src/engine/shapes/tools.ts)): star rays 3–12 / inner
  0.15–0.49; polygon sides 3–12; spiral turns ± direction; moon thickness = the *gap* between arcs;
  gear teeth/depth; sun rays + core/rayBase/rayLength/alternate/taper/width/wave/twist; bento
  cols/rows/gap/radius/inset/chaos/merge/seed; ellipse power (superellipse, 2 = circle); arrowHead
  0.1–0.6 of drag length; wavePeriods 1–8. Full lists: [`box.ts`](../../src/engine/shapes/box.ts),
  [`radial.ts`](../../src/engine/shapes/radial.ts), [`flow.ts`](../../src/engine/shapes/flow.ts),
  [`tools.ts`](../../src/engine/shapes/tools.ts).
- Skull ([`skull.ts`](../../src/engine/shapes/skull.ts)): one closed silhouette (cranium dome → brow
  → cheekbones → jaw → chin) + nested hole loops (two eyes, nose, toothed mouth) — ~20 `skull*`
  params (crown shape, brow ridge, eye size/spacing/tilt/asym, nose shape, teeth count/shape…).

## Invariants & constraints

- Bresenham guards: `linePoints` caps at 100k steps; seeded layouts (bento) must stay stable between
  frames → mulberry32 with an explicit seed param.
- `concentric` radii have a default (`[1, 0.66, 0.33]` = `DEFAULT_CONCENTRIC_RADII`);
  `hasDefaultConcentricRadii` gates parametric-commit regeneration.
- Shape decoration order is fixed: bulge first, then corner rounding ([`decorate.ts`](../../src/engine/shapes/decorate.ts)).
- Plain rectangles keep a pixel-exact fast path in `rectPoints` (direct rows/columns when corner and
  bulge are 0).

## Performance characteristics

Shape rasterization cost scales with the drag box (sampling) + stroke length (Bresenham); the
generators themselves have no dedicated bench — [`tools.bench.ts`](../../src/engine/paint/tools.bench.ts)
covers flood fill and the `symmetryPoints` orbit costs that dominate a symmetrized shape stroke, and
[`src/engine/geometry/geometry.bench.ts`](../../src/engine/geometry/geometry.bench.ts) exercises the
full rebuild path the stamped cells feed into.

## Testing

- [`shapes.test.ts`](../../src/engine/shapes/shapes.test.ts) — geometry of the tool families.
- [`shapes.skull.test.ts`](../../src/engine/shapes/shapes.skull.test.ts) — silhouette + hole loops,
  knob behavior.
- [`fill.test.ts`](../../src/engine/shapes/fill.test.ts) — `regionCells` (border-touching outlines,
  holes) and `pointInPolys`.
- Orbit costs: [`tools.bench.ts`](../../src/engine/paint/tools.bench.ts).

## Related decisions

- [symmetry](symmetry.md) — the two application paths (per-copy re-rasterization vs orbit expansion).

## OpenSpec capabilities

- `openspec/specs/drawing-tools/spec.md`, `openspec/specs/canvas-grid/spec.md`

## Known limitations

- Only the skull carries holes; other shapes are simple loops (even-odd ready if needed).
- Non-square grids consume the float polylines directly; their cell lookup is per-grid
  (`grid.cellAt`), no sub-cell equivalents.
