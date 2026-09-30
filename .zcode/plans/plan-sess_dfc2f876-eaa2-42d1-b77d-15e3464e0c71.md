# Performance Deep-Research Plan — Ditherlab

**Scope (per your answers):** performance and rendering research only. Deliverables = `docs/perf-research.md` + new benchmarks + prototype spikes with measured numbers. **No production code changes** — anything not graduated into the roadmap is bench-local code. The uncommitted texture WIP in the working tree stays untouched.

## What the exploration found (verified)

The engine is already heavily optimized (RLE run-merge −98/99%, O(staged-cells) stroke preview, WeakMap caches, scratch buffers). Remaining costs are **architectural**, and `bench/PERFLOG.md` (read in full) already points at them:

1. **Commit = 3 whole-document passes**: `buildComposite` full-buffer re-bake → `buildGeometry` whole-canvas path strings → art-bitmap repaint. 4096² commit is 130 ms vs the 16 ms frame budget. PERFLOG's own declared next lever is a **tile data model** (M1/M2 notes, M5/M6 deferral rows).
2. **Node graph is the worst hotspot**: node-card `pos` lives inside the semantic `Graph` (`nodes/types.ts:137`), so dragging a card or scrubbing a param creates a new graph → identity memo misses → **full graph re-eval + full composite + full geometry + all editor stage previews, per pointermove**. `evalGraphStages` in the node editor is unmemoized (`node-editor-canvas.component.tsx:188-208`). **No bench covers graphs at all.**
3. **Per-cell styles defeat RLE**: cell forms/radius/texture emit a path string per inked cell (measured ×114 on runs-friendly ink; circles 512² 50% = 121.7 ms).
4. **Pan/zoom is O(document) per event**: art cache is keyed on view (`canvas-stage.component.tsx:881-908`), handlers not rAF-coalesced — the cache is useless exactly during gestures.
5. **Idle burn**: marching-ants rAF loop redraws the full overlay + two full-size scratch-canvas passes at 60 fps while a selection exists; hover cell-crossing re-renders the 1441-line stage (zero `React.memo` in the repo).
6. **Grid rendering**: Path2D is cached but re-rasterized on every base frame (dense hex grids = thousands of polygons); grid-native outline mode builds string edge keys (`grid-geometry.ts:179-247`).
7. **All heavy auxiliary work is main-thread**: autosave stringify every 2 s, thumbnail re-render (full buildGeometry), `renderPng` up to 5000 px, import dithering, serialize/parse. Two hand-rolled workers (`trace.worker.ts`, `gradient.worker.ts`) prove the transferable-ArrayBuffer pattern works here. Rust toolchain (cargo 1.91 + wasm-pack) is installed but unused (PERFLOG M6).

## Research phases

**Phase 0 — Baseline & missing instrumentation.**
Add engine benches (`src/engine/*.bench.ts`, deterministic fixtures per `bench-doc.util.ts`): node-graph eval (k-node chain, repeat/warp nodes), the "node drag / param scrub" flow, outline-mode and metaball rebuild, grid rasterization, autosave encode at 2048²/4096². Add browser scenarios (`src/app/bench/bench-scenarios.ts`): node-card drag (N pointermoves), param scrub, pan gesture, wheel-zoom burst, idle-with-selection. Record a fresh browser checkpoint into `bench/results/` + PERFLOG rows. Capture DevTools profiles of stroke@4096², node drag, pan, export PNG as evidence in the doc.

**Phase 1 — Node graph re-rendering (highest leverage).**
Experiments (bench-local): (N1) layout/`pos` decoupled from `Graph` — measure that a drag then costs zero raster work; (N2) rAF-coalesced graph edits (one dispatch per frame); (N3) dirty-subgraph incremental evaluation (only nodes downstream of the edit) + cached topo order invalidated on edge changes only, replacing the all-or-nothing identity memo; (N4) memoized `evalGraphStages` + per-stage preview caching. Gates: drag → 0 raster work; param scrub ≤ 16 ms/frame at 4096².

**Phase 2 — Tile data model spike (the big lever).**
Design section + bench-local prototype: tiles (e.g. 256×256 cells), per-tile composite/geometry caching, dirty-tile tracking from staging/commit, undo as region patches (replaces full-doc restore, 122 ms → ~0). Measure patched composite + per-tile geometry vs whole-canvas at 2048²/4096². Gate: **4096² commit ≤ 16 ms**; extend `perf-stress.test.ts`-style invariants conceptually (tile output ≡ whole-canvas output) in the doc.

**Phase 3 — Per-cell styles vs RLE.**
Measure three candidates against `circles 512² 50% runs` (121.7 ms → target ≤ 10 ms): (a) run-instancing (one fragment per run, form applied per cell only at raster time via cached Path2D + transform), (b) CanvasPattern/texture-as-fill instead of baked per-cell flecks, (c) hybrid: RLE for runs + per-cell overlay only at boundaries.

**Phase 4 — Canvas pipeline quick wins (measured prototypes).**
(C1) pan/zoom O(1): blit cached art bitmap with offset during gesture, repaint on settle; rAF-coalesce wheel/pan/pinch. (C2) ants: minimal per-frame overlay, pause when occluded/unchanged, skip `blitOutsideStrokes` unless selection changed. (C3) hover out of the render path + `React.memo` on stage children. (C4) grid raster cached as bitmap keyed (dims, zoom); numeric edge keys in `grid-geometry.ts`. (C5) stroke fallbacks (metaball/outline/texture/non-square): per-tile incremental preview (needs Phase 2) vs rAF-throttled full rebuild — compare both.

**Phase 5 — Concurrency decision matrix (Workers / WASM / WebGPU).**
Each candidate → prototype → numbers → PERFLOG decision row: (W1) autosave serialize+stringify+thumbnail in a worker (proven pattern, pure engine functions). (W2) composite+geometry in a worker with transferables (feasibility depends on Phase 2 tile API making transfer cheap; evaluate SharedArrayBuffer). (W3) export via `renderPng` on `OffscreenCanvas` in a worker — the natural OffscreenCanvas adoption point. (W4) **bounded Rust→WASM spike**: port one numeric core — flood fill (9.4 ms @2048²) and/or metaball field splat — via wasm-pack, bench vs TS under vitest; decision gate: ≥2× core speedup AND the core is ≥20% of its end-to-end scenario, else "stay TS" row. (W5) WebGPU re-check only after Phase 2: does raster still matter?

**Phase 6 — Persistence & import/export.**
Worker/off-thread stringify, incremental patch serialization, thumbnail from the tile cache, `convertImage` import pipeline in a worker — sized from Phase 0 benches.

## Deliverables

- `docs/perf-research.md` — findings, profiles, per-phase numbers, decision matrix, prioritized implementation roadmap with target metrics and gates (sibling to `vectorization-research.md`).
- New engine + browser benches; fresh checkpoint JSONs in `bench/results/`; a PERFLOG row per experiment.
- Prototype spikes self-contained in bench files; **no engine/UI production changes**.

## Verification

Full feedback loop green: `npm run format:check`, `lint`, `arch:check`, `knip`, `npx tsc --noEmit`, `npm test`, `npm run bench` (new benches included). Existing `perf-stress.test.ts` ratchets must stay green. I'll propose Conventional Commit texts (`bench(perf): …`, `docs(perf): …`) — you run `git commit` per convention.