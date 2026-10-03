# Node graph — technical notes

## Scope

The procedural node engine (`src/engine/nodes/`) and the node editor UI
(`src/features/nodes-editor/`). A scene object with a `graph` evaluates its ink and appearance
from the graph at composite time. The known P0 performance finding (card `pos` inside the
semantic `Graph`) is documented here and in the perf research.

## Module map

| File | Role |
|---|---|
| [`src/engine/nodes/index.ts`](../../src/engine/nodes/index.ts) | barrel: registers the 11 node families, re-exports the core |
| [`src/engine/nodes/types.ts`](../../src/engine/nodes/types.ts) | `defineNode` contract, `Graph`/`GraphNode`/`GraphEdge`, `Cells` |
| [`src/engine/nodes/eval.ts`](../../src/engine/nodes/eval.ts) | `evalGraph`, `evalGraphStages`, `rerollGraphSeeds`, Kahn topo sort |
| [`src/engine/nodes/eval-memo.ts`](../../src/engine/nodes/eval-memo.ts) | `evalGraphMemo` — identity WeakMap memo |
| [`src/engine/nodes/registry.ts`](../../src/engine/nodes/registry.ts) | node registry, `resolveParams`, `validateGraph`, `graphColors`, `registryJSON` |
| [`src/engine/nodes/context.ts`](../../src/engine/nodes/context.ts) | deterministic RNG (FNV-1a → mulberry32), `combineCells` merge rule |
| [`src/engine/nodes/params.ts`](../../src/engine/nodes/params.ts) | canvas-aware param bounds (`paramBounds`, `boundsWithValue`) |
| [`src/engine/nodes/presets.ts`](../../src/engine/nodes/presets.ts) | 22 core graph recipes, `fitGraphToCanvas`, `GRAPH_PRESETS` merge |
| [`src/engine/nodes/presets-dither.ts`](../../src/engine/nodes/presets-dither.ts) | 6 dither-era recipes (halftone screen engine + text source showcase) |
| `src/engine/nodes/*.node.ts` | 11 family files, 22 ops (see catalog below) |
| [`src/features/nodes-editor/node-editor-canvas.component.tsx`](../../src/features/nodes-editor/node-editor-canvas.component.tsx) | DOM/SVG card-and-wire editor (~1240 lines) |
| [`src/features/nodes-editor/node-preview.component.tsx`](../../src/features/nodes-editor/node-preview.component.tsx) | per-node raster/style previews (`CellsPreview`, `StyleSamplePreview`) |
| [`src/features/nodes-editor/object-graph-panel.component.tsx`](../../src/features/nodes-editor/object-graph-panel.component.tsx) | list-order panel, presets, reroll |

## How it works

**Contract** (`defineNode`): raster nodes (`kind: 'source'|'mod'|'ramp'`) map `Cells → Cells`
(`evaluate(ctx, params, input)`); style nodes (`kind: 'style'`) mutate an evaluator-provided
style clone. `Cells = Map<number, number>` — buffer index (`y·bw + x`, `bw = cols·sub`) →
1-based palette value. `GraphNode { id, op, params, unknown?, pos? }`: `unknown: true` nodes
are version-skew imports — kept (graphs round-trip across app versions) but skipped by the
evaluator; `pos` is the editor card position — **serialized inside `Graph`**
([`src/engine/nodes/types.ts`](../../src/engine/nodes/types.ts)), which is the P0 finding
below. `Graph { graphVersion: 1, nodes, edges? }` — without edges the list order is the flow
(each node feeds the next, like a chain).

**Evaluation** ([`src/engine/nodes/eval.ts`](../../src/engine/nodes/eval.ts)): edges present →
Kahn topological pass; several wires into one input merge by union (first-writer-wins per
cell); no edges → list-order chain. Style nodes apply first, in list order, to a cloned base
style. `evalGraphStages` returns cumulative per-node stages for the editor's previews.
Determinism invariant: "the same graph, palette and base style always produce identical cells.
The base style is never mutated." A graph containing any source node is fully procedural —
the object's stored ink is ignored; style-only graphs keep it.

**Memo** ([`src/engine/nodes/eval-memo.ts`](../../src/engine/nodes/eval-memo.ts)):
`WeakMap<Graph>` hit requires identity of graph, input cells, palette array, base style,
bw/bh — "graph/cells/style references are stable between edits (tree mutations clone the
object), so identity comparison is enough". This memo serves the composite bake + per-layer
geometry; the *editor's* per-node previews (`stageMap` in
[node-editor-canvas.component.tsx](../../src/features/nodes-editor/node-editor-canvas.component.tsx))
bypass it and re-run `evalGraphStages` on every `[graph, doc, obj]` change.

**Deterministic randomness**: `ctx.rng(key)` = mulberry32 seeded `hashStr(op::nodeId) ^
hashStr(key)` — "(node id, key) fully determines the value, so randomness survives
re-evaluation and stays stable across undo/redo". 🎲 (`rerollGraphSeeds`) bumps every param
matching `/seed/i` to `1+floor(rnd·9999)`. `crown` node additionally seeds its own PRNG from
its numeric `seed` param.

**Reaching into the other engine domains.** The `nodes/` core is thin on purpose; the family
files import the domain folders they reuse (the engine's intra-layer dependency edges, all
visible in the `*.node.ts` imports):

- `source.rect/line/ellipse/shape` and `source.crown` rasterize through the shape tools'
  geometry — [`src/engine/shapes/index.ts`](../../src/engine/shapes/index.ts) and
  [`src/engine/shapes/fill.ts`](../../src/engine/shapes/fill.ts) (`fillCellsEvenOdd`,
  `regionCells`).
- `mod.warp` wraps the selection warp effect — [`src/engine/effects/warp.ts`](../../src/engine/effects/warp.ts)
  (`inkBox`, `warpInk`, `WARP_KINDS`); `mod.symmetry` maps points through
  [`src/engine/effects/symmetry.ts`](../../src/engine/effects/symmetry.ts) (`symmetryPoints`).
- `mod.halftone` screens through the dither domain's
  [`src/engine/dither/screen-engine.ts`](../../src/engine/dither/screen-engine.ts) (lattice ×
  mark × size/density/twist × pitch) with `hash2` from
  [`src/engine/texture/core.ts`](../../src/engine/texture/core.ts); `mod.hatch` reuses the
  engraved-line systems from [`src/engine/dither/screen-lines.ts`](../../src/engine/dither/screen-lines.ts)
  (`hatchDistance`, `HatchSystem`).
- `source.text` rasterizes text via [`src/engine/glyph/text-raster.ts`](../../src/engine/glyph/text-raster.ts)
  (`textTiles`, backed by the 5×7 font in [`src/engine/glyph/font.ts`](../../src/engine/glyph/font.ts)).
- `style.*` validates/applies cell shapes through
  [`src/engine/cell-shapes/index.ts`](../../src/engine/cell-shapes/index.ts)
  (`CELL_SHAPE_IDS`, `isCellShapeId`, `normalizeShapeParams`).
- `types.ts`/`eval.ts` import only `ElementStyle` from
  [`src/engine/core/doc.ts`](../../src/engine/core/doc.ts) — the style the graph dresses.

## Catalog (22 ops)

Sources: `source.rect/line/ellipse` (reuse the shape tools' rasterizers), `source.shape`
(all 22 shape-tool silhouettes + ~60 params), `source.grid` (whole-buffer patterns),
`source.crown` (procedural crown: band + spikes + jewel holes), `source.text` (the embedded
5×7 bitmap font as ink cells). Mods: `recolor`, `offset`, `symmetry`, `warp`
(placement-independent, centered on ink bbox), `arrayGrid`, `arrayCircle`, `path` (line/arc/
sine stamping), `scale`, `halftone` (screen re-render of the input raster), `hatch` (engraved
line systems carved into fills). Ramps: `ramp.gradient` (angle projection → palette lerp).
Styles: `pixel`, `render`, `metaball`, `texture`. Registry + presets + JSON import/export go
through `validateGraph` (clamps, id dedup with `~` suffix, cycle breaking, `pos` clamp
±100000).

## The editor UI

A pannable/zoomable (0.25–2) DOM/SVG canvas: cards are `div`s (190 px, translate+scale),
wires are cubic Béziers in one `<svg>` layer with per-edge gradients **colored by domain**
(raster `#818cf8`, style `#34d399`, vector `#fb923c` — "the color says WHAT flows through it,
not the direction"). Wire creation resolves drops via `elementFromPoint`; cycles blocked by
DFS reachability. Non-procedural graphs show a dashed "Base ink" card. Per-node previews:
raster stages render through `CellsPreview`, style nodes through a mini `Doc` →
`buildGeometry` + `drawGeometry`. `ParamInput` drags within canvas-derived bounds
(`paramBounds`: canvas ±15 %) while typing may reach schema bounds; `boundsWithValue` keeps
graphs authored on bigger canvases displayable.

## Working with graphs (absorbed from the former `docs/nodes.ru.md` user guide)

The mental model: a graph turns an object from "smeared pixels" into a **living recipe** —
like shader nodes in Blender or effects in After Effects, except the input/output medium is
the pixel grid. Flow: **sources** paint → **modifiers** transform → **ramps** recolor →
**styles** dress.

- The object's own ink is always the implicit first input: style nodes dress it, ramps
  recolor it, sources paint over it (`mode`: `add` over / `subtract` cut / `intersect`
  keep). A from-scratch object = erase the old ink, clear the object, or include a source
  node (graphs with sources ignore stored ink entirely).
- Node colors are plain hex; hexes missing from the document palette join the derived palette
  at evaluation (`graphColors`).
- Recipes scale with the canvas: presets are tuned for 16×16 and `fitGraphToCanvas` rescales
  coordinate params (`SCALE_KEYS`) by `min(bw,bh)/16`; new pixel projects default to 128×128.
- Typical recipes (all available as presets): ellipse → `arrayCircle` → `ramp.gradient` →
  `style.render` (metaball copies merge softly); rect → `mod.symmetry` (quad) → rounded
  pixels; `source.shape` (star) → `style.render` (outline) → `style.texture` (grain).
- Editor navigation: drag background to pan, wheel to zoom, Fit/Hand buttons, auto-layout by
  longest-path depth columns; wires connect out-socket → in-socket, multiple wires into one
  input union, click-select + Delete to remove; cycles are blocked (imports break them at
  back-edges with warnings).
- **AI integration**: the toolbar's "Node registry" downloads `registryJSON()` — a
  machine-readable schema of *every* node (ops, params, types, ranges, defaults). It is
  designed as an AI tool schema: give it to a model together with the task and it returns a
  graph JSON, which imports through `validateGraph` (unknown ops kept-but-skipped, params
  clamped to the schema).

## Invariants & constraints

- Store integration: `doc.slice.setObjectGraph(id, graph|null)` attaches/detaches via
  `updateNode` + `syncDoc`; `applyGraphPreset` deep-copies, `fitGraphToCanvas` scales
  `SCALE_KEYS` by `min(bw,bh)/16` (presets are tuned for 16×16; card positions pass through
  untouched).
- Params: only schema keys survive validation; number/int clamped + int-rounded; hex
  normalized to lowercase `#rrggbb`.

## Performance characteristics

- **P0 — card drag defeats the memo**: `pos` lives inside `Graph`, so dragging clones the
  graph → memo miss → full re-evaluation + composite + geometry *per pointermove*: 687 ms/tick
  engine-side, ~1.7 s/tick in the browser at 4096²; decoupled, the memo hits and the cost is
  ≈0 ([`src/engine/nodes/graph.bench.ts`](../../src/engine/nodes/graph.bench.ts),
  `docs/research/performance.md` §3.2 — roadmap P0).
- Full graph eval at 4096² ≈ 651 ms — `Cells = Map` churn dominates; typed-array cells are
  the P3 lever. Dirty-suffix re-eval alone buys only 1.27×.
- Editor previews re-evaluate unmemoized per scrub (above) — small, safe win after the pos
  split.

## Testing

[`src/engine/nodes/nodes.test.ts`](../../src/engine/nodes/nodes.test.ts) (709 lines, incl.
"every registered node evaluates deterministically on defaults"),
[`src/engine/nodes/params.test.ts`](../../src/engine/nodes/params.test.ts),
[`src/engine/nodes/crown.test.ts`](../../src/engine/nodes/crown.test.ts); bench
[`src/engine/nodes/graph.bench.ts`](../../src/engine/nodes/graph.bench.ts).

## Related decisions

- [ADR-0001](../decisions/0001-pure-ts-engine-layer.md) — the engine/UI split line runs
  through here: `nodes/` is pure, the card editor is a feature.

## OpenSpec capabilities

- No dedicated capability spec yet; behavior surfaces through `drawing-tools` and
  `project-library` (graph serialization inside projects). User guide content was absorbed
  from the former `docs/nodes.ru.md`.

## Known limitations

- `vector` domain is reserved (no vector nodes yet).
- Editor previews unmemoized (above); pos-split not implemented (roadmap P0).
- With edges, `evalGraph` returns the last topological stage — the header's "union of sinks"
  wording describes merge semantics, not the return value.

## Halftone, text and the luma service (2026-10)

- `mod.halftone` re-renders the input raster as a screen of marks through
  [`src/engine/dither/screen-engine.ts`](../../src/engine/dither/screen-engine.ts) (lattice ×
  mark × size/density/twist × pitch). Tone per cell comes from `EvalContext.luma(value)` —
  the palette-luminance service built in
  [`src/engine/core/scene.ts`](../../src/engine/core/scene.ts) from the derived palette (the
  sanctioned context-service extension point). `keepColor` reuses each mark's source palette
  value instead of a fixed ink.
- `source.text` rasterizes the embedded 5×7 bitmap font
  ([`src/engine/glyph/font.ts`](../../src/engine/glyph/font.ts)) into ink cells via
  `textTiles` ([`src/engine/glyph/text-raster.ts`](../../src/engine/glyph/text-raster.ts))
  (offset/scale/tracking/ink). It needs no DOM, so it evaluates anywhere the graph does.
  Enabled by the `string` param kind threaded through the schema, resolver and both node
  editors.
- Registered presets showcase both:
  [`src/engine/nodes/presets-dither.ts`](../../src/engine/nodes/presets-dither.ts) adds six
  dither-era recipes — halftone-print, stipple-garden, engrave-rings, type-stamp,
  type-halftone, duotone-sun — merged ahead of the 22 core recipes in `GRAPH_PRESETS`
  ([`src/engine/nodes/presets.ts`](../../src/engine/nodes/presets.ts)).
