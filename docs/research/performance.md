# Performance deep research — engine, rendering, node graph (2026-09-30)

Companion to `bench/PERFLOG.md` (the canonical optimization log) and `docs/research/vectorization.md`.
Scope: a measured answer to "what is actually slow, and what is worth building next" for the render
core, the node-graph pipeline and the canvas layer — including decision spikes for Web Workers,
Rust→WASM and the tile data model the PERFLOG M5/M6 rows deferred. **No production code was
changed**; every experiment lives in bench files (`src/engine/*.bench.ts`,
[`src/app/bench/bench-scenarios-graph.ts`](../../src/app/bench/bench-scenarios-graph.ts), `bench/wasm-flood/`).

Method: deterministic engine benches (node, vitest bench, mulberry32 fixtures) + the real-app
browser harness (`?bench=1`, metric = dispatch → React render + canvas effects complete). The
2026-09-30 browser checkpoint ran with `framesLive: false` (occluded pane — same condition as the
M0 baseline): paint is excluded by design, stroke cadence falls back to effect-hops, and the
rAF-driven marching-ants scenario is cadence-bound rather than work-bound (flagged below).

---

## 1. Executive summary

| # | Finding | Evidence | Verdict |
|---|---|---|---|
| 1 | **Node-card `pos` inside `Graph` makes dragging cost a full re-evaluation** — 687 ms/tick at 4096² engine-side, ~1.7 s/tick end-to-end in the browser; decoupled, the identity memo hits and the cost is ~0 | `graph.bench.ts` drag describe; browser `node drag` group | **Do first. Trivial, ~free 100 % win for drag.** |
| 2 | **Whole-canvas geometry rebuild is still the commit bottleneck** — a local edit touching 1.6 % of a 2048² canvas rebuilds 100 % of the geometry (233 ms); per-tile rebuild of the dirty area is 6.3 ms (37×) | `tile-spike.bench.ts` | **Tile model confirmed as the next lever (PERFLOG M1/M5). Design doc → implementation.** |
| 3 | **A full graph evaluation costs 651 ms at 4096² (~1.2 M map cells)**; dirty-suffix re-eval helps only 1.27× because array/ramp nodes are themselves O(cells) Map churn | `graph.bench.ts` | Node eval needs per-node efficiency (typed-array `Cells`), not just incrementality. |
| 4 | **Texture (grain) rebuild = 1 691 ms, outline@2048² = 722 ms per call** — and both are exactly the modes whose in-stroke preview falls back to `buildGeometry` **per rAF frame** | `render-modes.bench.ts`; fallback matrix `geometry.ts:158-198` | The stroke-fallback cliff is the worst UX hazard found. Fix after tiles (per-tile preview) or throttle fallback rebuilds. |
| 5 | **Rust→WASM: stay TS.** A tuned pure-TS flood (3.1 ms) matches the Rust core (≈3.2 ms core-only) — the current TS loses 3.5× to its own per-cell allocations, not to JS | `flood-wasm.bench.ts` + `bench/wasm-flood/` | Algorithmic tuning beats the toolchain; PERFLOG M6 deferral stands. |
| 6 | **Zoom/pan is NOT a bottleneck** (correcting the static analysis): a wheel step is 2.5–4.9 ms at every size, and a 10-tick burst costs 3 ms — React batches view updates into one art rebuild | browser `zoom` + `wheel burst` groups | Deprioritize the "O(1) gesture" rework. |
| 7 | Commit 4096² = 116–190 ms, undo = 100–154 ms (full-document restore) — both vs the 16 ms frame budget | browser checkpoint 2026-09-30 | Tiles + patch-undo are the path to budget (§4). |
| 8 | Idle with a selection redraws the full overlay per rAF (marching ants + scratch-canvas passes) — could not be measured under `framesLive: false`; static analysis says constant burn while selected | `idle selection` group (cadence-bound numbers) | Cheap fix candidate (pause when occluded, minimal redraw); **measure with live frames first**. |

---

## 2. What was measured and how

**New engine benches** (`npx vitest bench --run <file>`; full suite `npm run bench` →
`bench/results/engine-bench.json`):

| File | Coverage |
|---|---|
| [`src/engine/nodes/graph.bench.ts`](../../src/engine/nodes/graph.bench.ts) | graph eval (chain of ellipse → quad symmetry → ×3 linear array → gradient ramp), `evalGraphStages` (node-editor previews), node-drag memo miss vs hit, pos-only commit through `syncDoc`, param-scrub full vs dirty-suffix spike |
| [`src/engine/geometry/render-modes.bench.ts`](../../src/engine/geometry/render-modes.bench.ts) | full-rebuild cost of outline (512²/2048²), metaball, baked grain texture, triangle grid — the modes that had no coverage and are the per-frame stroke fallback |
| [`src/engine/geometry/tile-spike.bench.ts`](../../src/engine/geometry/tile-spike.bench.ts) | tile-model granularity spike: per-tile geometry vs whole-canvas; local-edit cost; composite patch floor |
| [`src/engine/geometry/style-decompose.bench.ts`](../../src/engine/geometry/style-decompose.bench.ts) | per-cell style cost decomposition: status quo circles vs string-emission emulation (3-decimal, integer, stadium-per-run) |
| [`src/engine/paint/flood-wasm.bench.ts`](../../src/engine/paint/flood-wasm.bench.ts) | flood fill: current TS vs tuned TS vs Rust cdylib (`bench/wasm-flood/`) |

**New browser scenario groups** ([`src/app/bench/bench-scenarios-graph.ts`](../../src/app/bench/bench-scenarios-graph.ts), registered in
`bench-scenarios.ts`): node drag ×N, param scrub ×N (both flush effects per tick — the real drag
cadence), wheel burst ×10 (one flush), idle-with-selection overlay ×30 frames.

**Fresh checkpoints:** `bench/results/engine-bench.json` (full suite re-run 2026-09-30) and
`bench/results/browser-bench-2026-09-30.json`.

Numbers below are from the isolated 2026-09-30 runs (medians/means as marked); the full-suite
re-run may differ by a few percent.

---

## 3. Node graph pipeline (worst hotspot → cheapest wins)

### 3.1 The evaluation tax

One procedural object (4-node chain, ~1.2 M output cells at 4096²):

| Scenario (node, mean) | Cost |
|---|---|
| `evalGraph` full chain @ 4096² | **650.8 ms** |
| `evalGraphStages` @ 4096² (node-editor per-node previews) | 645.0 ms |
| `evalGraph` chain @ 512² | 4.5 ms |

Every semantic graph edit re-evaluates everything (the identity memo cannot hit by construction:
a param change creates a new `Graph`). Every commit re-bakes the composite and re-builds geometry
**on top** — hence the browser numbers below.

### 3.2 Dragging a card is the most expensive no-op in the app

`GraphNode.pos` (editor card position) lives inside the semantic `Graph`
(`src/engine/nodes/types.ts:137`), so **moving a card clones the graph → memo miss → full
re-evaluation + composite + geometry + editor stage previews, per pointermove**:

| Scenario | Cost |
|---|---|
| Engine: drag tick, current model (memo miss), 4096² | **687.2 ms** |
| Engine: drag tick, pos decoupled (memo hit) | **≈ 0** (28 M hits/s — lookup only) |
| Engine: pos-only commit through `syncDoc` @ 2048² | 96.5 ms → **5.0 ms** decoupled (×19) |
| Browser: node drag ×6 @ 4096², per-tick effects | **10 161 ms (≈ 1 693 ms/tick)** |
| Browser: pencil stroke ×60 @ 4096² (for contrast) | 276 ms (≈ 4.6 ms/move) |

**Verdict — do it first.** Move `pos` out of `Graph` into a layout map keyed by node id (or a
parallel serialized section): dragging becomes a pure UI-state change with zero raster work.
Serialization must version the split (`graphVersion: 1` + layout section, legacy graphs read
`pos` as fallback).

### 3.3 Param scrubbing: incrementality alone is not enough

| Strategy (4096², scrub `mod.symmetry.n`) | Cost |
|---|---|
| Current: full re-eval | 707.6 ms |
| Spike: dirty-suffix re-eval (nodes 3–4 only, prefix cached) | 556.2 ms (**1.27×**) |

The suffix (array + ramp) dominates because every node allocates fresh `Map`s over all cells
(`combineCells`, per-stage copies in `evalGraphStages`). Conclusions:

1. Dirty-suffix evaluation is still worth having (edits near the graph sink become ~free), but
2. the real lever is **per-node efficiency**: `Cells = Map<number, number>` → typed-array-backed
   cells (or chunked/persistent structure). A 5–10× cut in per-node cost is plausible and would
   bring the 651 ms eval into the ~60–130 ms range;
3. rAF-coalesce graph edits (one dispatch per frame, like staging already does for strokes) —
   scrubbing then pays the eval at frame rate, not at pointermove rate.

The node editor's own previews re-evaluate the graph unmemoized per render
(`node-editor-canvas.component.tsx:188-208`) and copy the accumulator per chain stage
(`eval.ts:123`); memoizing stages per (graph, input) identity is a small, safe win after the
`pos` split.

---

## 4. The tile data model — the declared lever, now with numbers

`buildGeometry` and `buildComposite` run over the whole buffer on every commit. The spike
(`tile-spike.bench.ts`, 2048², 5 % scatter ink, 256×256 tiles):

| Scenario (node, mean) | Cost |
|---|---|
| Whole-canvas geometry rebuild (today) | 233.3 ms |
| Same work partitioned into all 64 tiles (extraction included) | 131.1 ms |
| **Local edit: 4 dirty tiles (1.6 % of the canvas)** | **6.3 ms (37×)** |
| `syncDoc` full composite rebuild after a tree change | 4.2 ms |
| Composite patch floor (buffer slices + repaint 1 obj) | 3.0 ms |

Findings:

- **Geometry is where tiling pays** — O(changed tiles) instead of O(canvas), roughly linear in
  area (1.6 % of area → 2.7 % of cost). Even a full-canvas tiled pass is cheaper than today's
  single pass (smaller working set, smaller string joins).
- **Composite patching is a second-order win** at 2048² (−1.2 ms); at 4096² the two full-buffer
  allocations (~100 MB) dominate more, and avoiding them matters for the 16 ms budget.
- Design implications for a real implementation: dirty tracking from staging/commit bboxes;
  per-tile geometry cache keyed by (tile content hash, style, view-independent); **tile-aligned
  run merging** (the spike's scatter ink hides seam effects; run-friendly ink needs border-aware
  merging); undo as region patches (kills the 100–154 ms full-document restore);
  `stagingPreview`'s O(staged) property must be preserved (it is the existence proof the PERFLOG
  baseline demanded).
- Gate for the implementation phase: **commit 4096² ≤ 16 ms** for a local edit, with
  pixel-identical output vs the whole-canvas rebuild (golden-image tests extending
  `perf-stress.test.ts`).

---

## 5. Render modes and grids — the stroke-fallback cliff

Full-rebuild cost is the per-frame cost for every mode where `stagingPreview` returns null
(outline, metaball, texture, connectors, non-square grids — `geometry.ts:158-198`; fallback
`canvas-stage.component.tsx:943-955`):

| Mode (512², 5 % ink, node mean; outline also 2048²) | Rebuild cost | vs pixels |
|---|---|---|
| pixels (reference) | 5.8 ms | 1× |
| metaball | 4.7 ms | 0.8× |
| triangle grid | 9.4 ms | 1.6× |
| outline | 36.3 ms | 6.3× |
| outline @ 2048² | **722.0 ms** | 125× |
| **grain texture (working tree incl. uncommitted texture WIP)** | **1 691.2 ms** | 293× |

- **Every rAF frame of a stroke on a textured or large outline document rebuilds the entire
  document.** On the measured machine that is a multi-second frame — the worst interaction cliff
  in the app. Post-tiles, the fix is a per-tile preview; pre-tiles, a defensible stopgap is
  rAF-throttling the fallback (one full rebuild per N frames) plus a "rebuild pending" badge.
- The texture path needs a cost decomposition of its own (region scan vs fleck emission vs
  fits-probes); re-measure after the uncommitted texture work lands — this number includes it.
- Metaball is cheap (kernel radius ≈ 1 cell at default strength) — not a priority.
- Grid overlays: square grid Path2D is prebuilt; dense non-square grids re-rasterize a
  thousands-polygon Path2D on every base frame (`canvas-stage.component.tsx:848-864`). Caching
  the stroked grid into its own bitmap keyed by (dims, zoom) is a small, contained win.

---

## 6. Per-cell styles — fragment count dominates, not string formatting

PERFLOG 2026-09-29 recorded cell forms defeating run merging (×114). The decomposition
(`style-decompose.bench.ts`, 512², 50 % runs = 131 k cells):

| Stage (node, mean) | Cost |
|---|---|
| Status quo: per-cell circle fragments through the pipeline | 195.3 ms |
| Scan + run merge only (squares) | 1.9 ms |
| Emulation: raw per-cell circle strings, 3-decimal coords | 12.6 ms |
| Emulation: integer coords | 7.1 ms |
| Emulation: stadium per run (~1 k fragments) | **0.39 ms** |

Raw string emission is only ~6 % of the per-cell cost (~1.5 µs/cell in the pipeline vs
~0.1 µs/cell for the string itself) — the generic fragment machinery (arc math, style grouping,
per-fragment allocation) dominates. Therefore:

- Integer coordinates alone buy ~5 % end-to-end. **Not worth it.**
- The pipeline-level candidates are (a) **reduce fragment count** — a "merged forms" style that
  emits one capsule/stadium per run (33× cheaper strings; *changes appearance*: adjacent circles
  touch — a product decision, viable as an opt-in style), or (b) **bypass path strings for
  forms** — draw-time instancing (one cached `Path2D` per form, `setTransform` per cell) moves
  the cost to raster time and needs a browser-side prototype with live frames before any
  verdict. Roads (a)/(b) are the follow-ups; the PERFLOG regression row stays monitored as-is.

---

## 7. Canvas layer — corrected priorities

- **Zoom/pan: demoted.** Wheel step 2.5–4.9 ms at all sizes (matches PERFLOG M1+M2a);
  a 10-tick burst costs ~3 ms total — React batches the view state, so the art layer rebuilds
  once per flush, not per event. The earlier "O(document) per event, cache useless during
  gestures" static claim does not manifest in the effect pipeline. Remaining idea (blit-with-
  offset during gesture) is a polish item, not a perf lever.
- **Commit anatomy at 4096²**: 116–190 ms browser-side = composite rebuild + whole-canvas
  geometry + art bitmap. Tiles address all three (per-tile caches).
- **Undo = full document restore**: 100–154 ms at 4096² and one full buffer pair pinned per
  history step. Patch-undo (region records) is part of the tile project.
- **Marching ants**: the overlay rAF loop redraws everything while a selection exists,
  including two full-size scratch-canvas passes (`blitOutsideStrokes`). Under
  `framesLive: false` this run only measured the cadence fallback (~500–640 ms / 30 frames) —
  **not a valid cost measurement**. Action: measure with live frames (visible window), then
  apply the cheap fixes (redraw only the ants path when the phase tick changes; skip scratch
  passes when selection/doc unchanged; pause when the canvas is occluded).
- **Hover**: crossing a cell boundary re-renders the 1441-line stage (zero `React.memo` in the
  repo; `setHover` bails only on same-cell, `canvas-stage.component.tsx:533-536`). Pure
  reconcile waste; fix by routing hover through the imperative overlay path (like staging does)
  or memoizing stage children. Small, safe, no measurement needed to justify.

---

## 8. Concurrency decision matrix (Workers / WASM / WebGPU)

Prior art: two hand-rolled workers with a request-id + transferable-ArrayBuffer protocol
(`trace.worker.ts`, `gradient.worker.ts`); no OffscreenCanvas/SharedArrayBuffer/WASM in
production (vtracer WASM is a dev-only parity oracle).

| Candidate | Evidence from this research | Verdict |
|---|---|---|
| W1 autosave serialize + stringify in a worker | autosave encode ≈ 1.7 ms @ 2048² scene (persistence bench) — cheap, but unbounded JSON at 4096² + thumbnail render do block every 2 s | **Adopt opportunistically** when touching persistence; low risk, proven pattern. |
| W2 composite + geometry in a worker | cost is allocation-dominated (tile spike); transferring whole buffers costs ~10 ms round-trip at 4096² — only viable **after tiles** make the transferred payload small (dirty tiles) | **Defer until tiles land.** |
| W3 export via OffscreenCanvas in a worker | `renderPng` builds up to 5000 px synchronously; the natural OffscreenCanvas adoption point, isolated from the hot path | **Adopt when export UX matters**; not on the frame-budget critical path. |
| W4 WASM numeric cores (spike built) | flood: current TS 11.0 ms → **tuned TS 3.1 ms** ≈ Rust core 3.2 ms (+0.7 ms restore copy). The TS loss is algorithmic (per-cell neighbor arrays + mask), not language speed | **Stay TS.** Gate ("≥2× AND ≥20 % end-to-end share") not met — the tuned TS matches WASM. `bench/wasm-flood/` kept for future cores (metaball field, trace) with the same gate. |
| W5 WebGPU | zoom effects already 3–4 ms on Canvas2D; raster is not the residue (PERFLOG M5) | **Stays deferred** (re-check only after tiles, if paint shows up in live-frame profiles). |

---

## 9. Persistence, import, export (sized)

- Autosave: debounced 2 s, fully main-thread (`JSON.stringify(serialize(doc))` +
  localStorage mirror ≤ 2 MB + IndexedDB put; thumbnail via full `buildGeometry` ≤ 1×/30 s).
  Encode is cheap at scene scale; the stringify + thumbnail are the off-thread candidates (W1).
- Import: `convertImage` (median-cut + dither) blocks the main thread behind a 60 ms setTimeout
  courtesy delay; the pipeline is pure engine work — a straightforward W1-style worker port.
- Load/boot: `deserialize` is a defensive full parse; fine at today's sizes, revisit with tiles
  (partial/projected loads).

---

## 10. Prioritized roadmap (proposal)

| P | Item | Target / gate | Based on |
|---|---|---|---|
| **P0** | Split `pos` out of `Graph` (layout map + serialization versioning); rAF-coalesce graph edits | drag tick ≈ 0 ms; scrub = 1 dispatch/frame | §3.2 |
| **P1** | Tile data model: dirty-tile geometry + composite patching + patch-undo | commit 4096² ≤ 16 ms (local edit); undo ≤ 5 ms; pixel-identity golden tests | §4 |
| **P2** | Stroke-fallback strategy for texture/outline (per-tile preview post-P1; fallback throttling pre-P1); texture cost decomposition | stroke frame ≤ 16 ms in all modes | §5 |
| **P3** | Node eval efficiency: typed-array `Cells` + per-node result memo; memoize editor stages | graph eval 4096² 651 → ≤ 130 ms | §3.1, §3.3 |
| **P4** | Canvas quick wins: hover out of the render path + `React.memo` stage children; ants minimal redraw (after a live-frames measurement); grid bitmap cache | no React render per cell crossing; idle-with-selection ≈ 0 when occluded | §7 |
| **P5** | Workers: autosave stringify/thumbnail, import dither, export OffscreenCanvas | no main-thread block > 16 ms from auxiliary features | §8, §9 |

Explicitly **not** recommended now: WASM/Rust cores (gate failed), WebGPU (raster not the
bottleneck), gesture rework (zoom already in budget), worker-offloading of composite/geometry
(before tiles make transfer cheap).

---

## 11. Infrastructure notes (for the next person running benches)

- tinybench floors every bench at its `time` budget (default 500 ms) regardless of
  `iterations` — expensive benches (texture ≈ 1.7 s/call) must cap `time` explicitly
  (see `render-modes.bench.ts`).
- A bench function that throws prints **no table and no error** (tinybench swallows it; hz 0 in
  the JSON, `NaNx faster` in the summary). The 2026-09-30 graph-drag describe silently no-op'ed
  this way (undefined import). Worth a runner-level assertion later.
- Do not hand-roll LCGs in fixtures: `seed * 1103515245` loses 2^53 precision, the scatter loop
  degenerates and **hangs the suite at collection**. Use `mulberry32` from `bench-doc.util.ts`.
- `framesLive: false` (occluded pane) keeps all dispatch→effects numbers honest but makes
  rAF-cadence scenarios (stroke cadence, marching ants) upper-bound or meaningless. The M0
  baseline ran under the same flag; M1+M2a got a `framesLive: true` run for the headline rows —
  the ants scenario here needs the same treatment.
- The Rust spike loads a raw cdylib (no bindings): `cd bench/wasm-flood && RUSTC="$(rustup which
  rustc)" cargo build --release --target wasm32-unknown-unknown` (explicit RUSTC needed where
  Homebrew's rustc shadows the rustup toolchain); the bench skips cleanly when the module is
  absent.
