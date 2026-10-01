# Geometry — technical notes

## Scope

`buildGeometry(doc, staging?)` — the single pipeline turning a `Doc` (+ optional in-stroke
staging) into `StyledPath[]`. Files: `src/engine/geometry.ts` (dispatch + staging preview),
`geometry-types.ts`, `geometry-elements.ts` (element-scope grouping), `geometry-shape.ts`
(pixel/fragment rendering), `geometry-metaball.ts`. Mode specialists live in
[render-outputs](render-outputs.md) (outline/marching squares) and [grids](grids.md)
(`gridBuildGeometry`). Committed pipeline context: [render-pipeline](../architecture/render-pipeline.md).

## Module map

| File | Role |
|---|---|
| `src/engine/geometry.ts` | dispatch, scene walk, `stagingPreview`, merged-cell scratch reuse |
| `src/engine/geometry-types.ts` | `StyledPath { d, fill?, stroke?, strokeWidth? }`, `Staging` |
| `src/engine/geometry-elements.ts` | per-element grouping, style-key merge, unattributed bottom group |
| `src/engine/geometry-shape.ts` | rect/run fragments, `roundedRectPath`, connectors, texture append |
| `src/engine/geometry-metaball.ts` | kernel field, marching-squares trace, per-color fields |

## How it works

Dispatch order (`geometry.ts:121–133`):

1. Scene doc → `sceneGeometry`: per visible layer bottom → top, one pair of reused scratch
   buffers; staged ink merges into the staged layer, staged erases route to each cell's
   composite owner (honest multi-layer move preview); metaballs/outlines never fuse across
   layers.
2. Element scope (with attribution) → `elementGeometry`.
3. Not a plain square grid → `gridBuildGeometry` (generic lattice path).
4. Else by `renderMode`: `metaballGeometry` / `outlineGeometry` / `shapeGeometry`.

`shapeGeometry` groups fragments per palette value into one compound `StyledPath` per color;
connectors become `M…L…` stroke paths with `doc.connectorWidth`. The **RLE fast path** merges
horizontal same-value runs into single rects when *all* hold: no texture, all radii 0,
`sizeX === sizeY === 1`, square shape with rotation 0, `toneSize` off. Anything else renders
per-cell fragments (`cellShapeFragment` for non-square cell forms; `toneSize` scales figures
by tone with a per-value memo).

**Staging preview.** `stagingPreview(doc, staging)` (geometry.ts:144–260) renders only the
staged delta in O(staged cells); staged unattributed cells use sentinel `PENDING_OBJ` so they
preview with document style. It returns `null` (→ full `buildGeometry` fallback) when: no
staged cells; not a plain square grid; link count changed; or the style in play is not
"usable" (`renderMode === 'pixels'` and `texture.effect === 'none'` — per element in element
scope, doc-level in global scope). That null matrix *is* the stroke-fallback cliff
([render-pipeline](../architecture/render-pipeline.md)).

## Data structures

- `Staging { cells?: Map<idx, value|null>, links?, objs?, palette?, layerId? }` — the
  stroke-in-flight delta; `null` value = erase.
- `StyledPath` — SVG path string + optional fill/stroke; the interchange format consumed by
  canvas, PNG and SVG export alike.

## Algorithms

- **Metaball**: splat a cubic kernel (`t = 1−d²/R²; f += t³`, `R` from strength:
  `(0.815 + strength/100·0.44)/sub`) per cell center at `quality` samples/cell; trace at
  ISO = 0.5 with marching squares; midpoint-quadratic smoothing. `perColor` builds one
  field per palette value; `corner` connectivity adds kernels at diagonal junctions;
  `squareEdges` mirrors the field at the canvas border. Field side is capped at 360 nodes
  for the in-stroke preview vs 700 committed — the preview quality drop is intentional.
- **Element merge**: groups whose frozen styles are equal (deep equality, cached as a string
  key in a WeakMap — O(ids) once instead of O(ids²) per frame) render as one group;
  `fuseObjects: false` appends the id to the key (Illustrator-style stacking).

## Invariants & constraints

- Evenodd fill is contractual downstream ([ADR-0002](../decisions/0002-canvas2d-rendering-webgpu-deferred.md)):
  texture holes are subpaths; bridge overlays must be a *separate* same-color path.
- Scratch buffers are module-level and reused per frame — builders must fully consume a
  buffer before the next user.
- Coordinates are doc units: buffer (bx, by) → `x = bx/sub + (1/sub − sizeX/sub)/2`; path
  numbers rounded to 3 decimals (`fmt`).

## Performance characteristics

- RLE path: `buildGeometry` −39 %…−99 % after PERFLOG M2a; runs test-pinned in
  `geometry-runs.test.ts`.
- Whole-canvas rebuild 2048² ≈ 233 ms vs 6.3 ms for 4 dirty tiles (`tile-spike.bench.ts`) —
  the tile model is the declared next lever.
- Fallback costs per rAF frame during strokes: outline@2048² 722 ms, grain texture ≈ 1.7 s
  (`render-modes.bench.ts`; see [texture](texture.md) §Performance).

## Testing

`geometry.test.ts`, `geometry-runs.test.ts`, `geometry-tone.test.ts`, `grid-geometry.test.ts`,
`perf-stress.test.ts` (cost-ratio ratchets). Benches: `geometry.bench.ts`,
`render-modes.bench.ts`, `style-decompose.bench.ts`, `tile-spike.bench.ts`.

## Related decisions

- [ADR-0002](../decisions/0002-canvas2d-rendering-webgpu-deferred.md) — Canvas2D + path-string
  interchange.

## OpenSpec capabilities

- `openspec/specs/pixel-styling/spec.md`, `openspec/specs/metaball-rendering/spec.md`,
  `openspec/specs/sub-cells/spec.md`

## Known limitations

- Whole-document rebuild per commit; per-tile caching is designed (`docs/research/performance.md`
  §4) but not implemented.
- `stagingPreview` covers only plain square pixel geometry — the largest remaining UX cliff
  for textured/outline documents.
