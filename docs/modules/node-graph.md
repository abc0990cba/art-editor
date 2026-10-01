# Node graph — technical notes

## Scope

The procedural node engine (`src/engine/nodes/`) and the node editor UI
(`src/features/nodes-editor/`). A scene object with a `graph` evaluates its ink and appearance
from the graph at composite time. The known P0 performance finding (card `pos` inside the
semantic `Graph`) is documented here and in the perf research.

## Module map

| File | Role |
|---|---|
| `src/engine/nodes/types.ts` | `defineNode` contract, `Graph`/`GraphNode`/`GraphEdge`, `Cells` |
| `src/engine/nodes/eval.ts` | `evalGraph`, `evalGraphStages`, `rerollGraphSeeds`, Kahn topo sort |
| `src/engine/nodes/eval-memo.ts` | `evalGraphMemo` — identity WeakMap memo |
| `src/engine/nodes/registry.ts` | node registry, `resolveParams`, `validateGraph`, `graphColors`, `registryJSON` |
| `src/engine/nodes/context.ts` | deterministic RNG (FNV-1a → mulberry32), `combineCells` merge rule |
| `src/engine/nodes/params.ts` | canvas-aware param bounds (`ParamSpan`), `boundsWithValue` |
| `src/engine/nodes/presets.ts` | 21 graph recipes, `fitGraphToCanvas` |
| `src/engine/nodes/*.node.ts` | 8 family files, 19 ops |
| `src/features/nodes-editor/node-editor-canvas.component.tsx` | DOM/SVG card-and-wire editor (1233 lines) |
| `src/features/nodes-editor/node-preview.component.tsx` | per-node raster/style previews |
| `src/features/nodes-editor/object-graph-panel.component.tsx` | list-order panel, presets, reroll |

## How it works

**Contract** (`defineNode`): raster nodes (`kind: 'source'|'mod'|'ramp'`) map `Cells → Cells`
(`evaluate(ctx, params, input)`); style nodes (`kind: 'style'`) mutate an evaluator-provided
style clone. `Cells = Map<number, number>` — buffer index (`y·bw + x`, `bw = cols·sub`) →
1-based palette value. `GraphNode { id, op, params, unknown?, pos? }`: `unknown: true` nodes
are version-skew imports — kept (graphs round-trip across app versions) but skipped by the
evaluator; `pos` is the editor card position — **serialized inside `Graph`**
(`types.ts:137`), which is the P0 finding below. `Graph { graphVersion: 1, nodes, edges? }` —
without edges the list order is the flow (each node feeds the next, like a chain).

**Evaluation** (`eval.ts`): edges present → Kahn topological pass; several wires into one
input merge by union (first-writer-wins per cell); no edges → list-order chain. Style nodes
apply first, in list order, to a cloned base style. `evalGraphStages` returns cumulative
per-node stages for the editor's previews. Determinism invariant: "the same graph, palette and
base style always produce identical cells. The base style is never mutated." A graph
containing any source node is fully procedural — the object's stored ink is ignored;
style-only graphs keep it.

**Memo** (`eval-memo.ts`): `WeakMap<Graph>` hit requires identity of graph, input cells,
palette array, base style, bw/bh — "graph/cells/style references are stable between edits
(tree mutations clone the object), so identity comparison is enough". This memo serves the
composite bake + per-layer geometry; the *editor's* per-node previews (`stageMap`,
node-editor-canvas.component.tsx:188–208) bypass it and re-run `evalGraphStages` on every
`[graph, doc, obj]` change.

**Deterministic randomness**: `ctx.rng(key)` = mulberry32 seeded `hashStr(op::nodeId) ^
hashStr(key)` — "(node id, key) fully determines the value, so randomness survives
re-evaluation and stays stable across undo/redo". 🎲 (`rerollGraphSeeds`) bumps every param
matching `/seed/i` to `1+floor(rnd·9999)`. `crown` node additionally seeds its own PRNG from
its numeric `seed` param.

## Catalog (19 ops)

Sources: `source.rect/line/ellipse` (reuse the shape tools' rasterizers), `source.shape`
(all 22 shape-tool silhouettes + ~60 params), `source.grid` (whole-buffer patterns),
`source.crown` (procedural crown: band + spikes + jewel holes). Mods: `recolor`, `offset`,
`symmetry`, `warp` (placement-independent, centered on ink bbox), `arrayGrid`, `arrayCircle`,
`path` (line/arc/sine stamping), `scale`. Ramps: `ramp.gradient` (angle projection → palette
lerp). Styles: `pixel`, `render`, `metaball`, `texture`. Registry + presets + JSON
import/export go through `validateGraph` (clamps, id dedup with `~` suffix, cycle breaking,
`pos` clamp ±100000).

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
  ≈0 (`graph.bench.ts`, `docs/research/performance.md` §3.2 — roadmap P0).
- Full graph eval at 4096² ≈ 651 ms — `Cells = Map` churn dominates; typed-array cells are
  the P3 lever. Dirty-suffix re-eval alone buys only 1.27×.
- Editor previews re-evaluate unmemoized per scrub (above) — small, safe win after the pos
  split.

## Testing

`nodes/nodes.test.ts` (707 lines, incl. "every registered node evaluates deterministically on
defaults"), `nodes/params.test.ts`, `nodes/crown.test.ts`; bench `graph.bench.ts`.

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
