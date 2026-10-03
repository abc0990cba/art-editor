# Ditherlab — technical documentation

Ditherlab (package `glyph-editor`) is a pixel/vector web editor that renders cell grids as
clean vector SVG. This tree documents **how the software works and why it is built the way
it is** — the durable technical truth, as opposed to the behavioral contracts.

## What lives where

| Question | Answered by |
|---|---|
| *What does the product do?* (behavior contracts, WHEN/THEN scenarios) | `openspec/specs/` (current truth), `openspec/changes/` (in-flight work + history) |
| *How does it work?* (architecture, data flow, algorithms) | `docs/architecture/` + `docs/modules/` |
| *Why was it built this way?* (technology choices, trade-offs, evidence) | `docs/decisions/` (ADRs) |
| *What is slow, what was measured?* | `bench/PERFLOG.md` (canonical log) + `docs/research/` (deep dives) |
| *What are the coding rules?* | `AGENTS.md` |
| *What does the app do for users?* | `README.md` |

**Boundary rule.** OpenSpec owns *behavior*: requirements, SHALL statements, scenarios.
`docs/` owns *technique*: architecture, algorithms, data models, and the reasoning behind
technology choices. An OpenSpec change's `design.md` is change-scoped; when the change is
archived, its durable decisions are promoted into `docs/decisions/` (ADR) and the affected
`docs/modules/` pages are updated (see [ADR-0007](decisions/0007-openspec-docs-boundary.md)).

**Language policy.** All documentation in this repository is written in English. Historical
rows of `bench/PERFLOG.md` predate this policy and stay in Russian; every new entry is English.

## Directory map

```
docs/
├── README.md            # this index
├── templates/           # copy-paste starting points (module tech doc, ADR)
├── architecture/        # cross-cutting system docs with diagrams
├── decisions/           # architecture decision records (ADRs), numbered
├── modules/             # per-subsystem technical docs (engine + its feature together)
└── research/            # point-in-time deep dives (performance, vectorization, import)
```

## Adding documentation — the template scenario

One scenario covers both doc kinds:

1. **Module doc** — copy `templates/module-tech-doc.template.md` to
   `docs/modules/<subsystem>.md`, fill every section with code-anchored facts (source files
   referenced as clickable relative markdown links — backtick the path as link text and point the
   href at the file — e.g. link text `` `src/engine/x/y.ts` `` with the href `../../src/engine/x/y.ts` 
   — plus exported symbol names; no line anchors, they drift), add the doc to the Module docs
   table below. Engine-domain pages carry 1–2 diagrams each; the repo-wide Mermaid budget scales
   accordingly (the historical "~10 diagrams total" cap predates the engine deep-dive expansion).
2. **Decision record** — if the work made a durable technology choice, copy
   `templates/adr.template.md` to `docs/decisions/NNNN-<slug>.md` (next free number), record
   alternatives and evidence, cross-link it from the module doc.

At OpenSpec archive time the `openspec-archive-change` flow adds one step: promote durable
`design.md` content into ADRs / module docs before moving the change to `changes/archive/`.

---

## Architecture

| Doc | Covers |
|---|---|
| [architecture/overview.md](architecture/overview.md) | Layered architecture, dependency boundaries, engine module map, toolchain, project kinds |
| [architecture/engine-map.md](architecture/engine-map.md) | **The `src/engine/` index**: every domain folder, its responsibility, public entry point and module doc; cluster dependency diagram |
| [architecture/data-model.md](architecture/data-model.md) | The `Doc`, scene tree vs flat buffers, store slices, undo, persistence model |
| [architecture/render-pipeline.md](architecture/render-pipeline.md) | Dispatch → `buildGeometry` → Canvas2D; stroke staging; the mode dispatch matrix; the fallback cliff |

## Decision records

| ADR | Title | Status |
|---|---|---|
| [0001](decisions/0001-pure-ts-engine-layer.md) | Pure-TS engine layer without React | accepted |
| [0002](decisions/0002-canvas2d-rendering-webgpu-deferred.md) | Canvas2D rendering; WebGL/WebGPU deferred | accepted |
| [0003](decisions/0003-rust-wasm-policy.md) | Rust/WASM policy: no Rust in production, gated re-entry | accepted |
| [0004](decisions/0004-vtracer-ts-port.md) | Trace pipeline ported from Rust vtracer to TypeScript | accepted |
| [0005](decisions/0005-zustand-single-store.md) | Single zustand store, sliced, with zundo history | accepted |
| [0006](decisions/0006-indexeddb-persistence.md) | IndexedDB persistence with debounced ambient autosave | accepted |
| [0007](decisions/0007-openspec-docs-boundary.md) | OpenSpec ↔ docs/ boundary and promotion flow | accepted |
| [0008](decisions/0008-landing-static-mpa.md) | Landing as a hand-rolled static MPA page, editor SPA at `/editor` | accepted |
| [0009](decisions/0009-metaball-field-threshold-falloff.md) | One metaball field builder; threshold and falloff as product controls | accepted |

## Module docs

| Doc | Subsystem | Entry points |
|---|---|---|
| [doc-and-scene](modules/doc-and-scene.md) | Document model, scene tree, serialization | `engine/core/doc.ts`, `engine/core/scene.ts`, `engine/core/project.ts` |
| [geometry](modules/geometry.md) | `buildGeometry`, staging preview, metaball field | `engine/geometry/index.ts`, `engine/geometry/*.ts` |
| [render-outputs](modules/render-outputs.md) | Canvas painting, PNG/SVG export, outline tracing | `engine/output/png.ts`, `engine/output/svg.ts`, `engine/geometry/outline.ts` |
| [shapes](modules/shapes.md) | Shape tool library + fill classification | `engine/shapes/index.ts`, `engine/shapes/*.ts` |
| [paint-tools](modules/paint-tools.md) | Brush model, flood fill | `engine/paint/brush.ts`, `engine/paint/floodfill.ts` |
| [grids](modules/grids.md) | Grid lattices, rotation, cell forms | `engine/grids/index.ts`, `engine/grids/*.ts`, `engine/cell-shapes/` |
| [symmetry](modules/symmetry.md) | Mirror/radial/kaleidoscope, wallpaper groups | `engine/effects/symmetry.ts`, `engine/effects/symmetry-*.ts` |
| [effects](modules/effects.md) | Warp fields, stylize ops, selection transforms | `engine/effects/warp.ts`, `engine/effects/stylize.ts`, `engine/effects/selection-xform.ts` |
| [texture](modules/texture.md) | Baked vector texture (holes, not raster) | `engine/texture/` (barrel [`index.ts`](../src/engine/texture/index.ts)) |
| [dither-and-patterns](modules/dither-and-patterns.md) | Threshold matrices, fill patterns, dithered gradients | `engine/dither/matrices.ts`, `engine/texture/fill.ts` |
| [image-import](modules/image-import.md) | Photo → cells dithering pipeline | `engine/import/` (facade [`index.ts`](../src/engine/import/index.ts)) |
| [node-graph](modules/node-graph.md) | Procedural node engine + node editor | `engine/nodes/`, `features/nodes-editor/` |
| [vectorizer](modules/vectorizer.md) | Raster→SVG tracing (vtracer port) + worker | `engine/trace/`, `features/vectorizer/` |
| [gradient-workspace](modules/gradient-workspace.md) | Raster→SVG gradient fitting + worker | `engine/gradient/`, `features/gradient/` |
| [glyphs](modules/glyphs.md) | Glyph-tile dithering + glyph editor | `engine/glyph/`, `features/glyph-editor/` |
| [palettes-and-presets](modules/palettes-and-presets.md) | Palettes, palette I/O, editor presets | `engine/color/`, `engine/presets/` |
| [canvas-stage](modules/canvas-stage.md) | Render surface, staging loop, selection UI | `features/canvas/` |
| [app-shell](modules/app-shell.md) | Routing, workspace shell, top bar, hotkeys, i18n, themes | `app/`, `shared/i18n/` |
| [settings-and-layers](modules/settings-and-layers.md) | Right settings column + layers panel | `features/settings-panel/`, `features/layers/` |
| [projects-and-demos](modules/projects-and-demos.md) | Home screen, library cards, demo registry | `features/projects/`, `engine/demos/` |
| [state-store](modules/state-store.md) | zustand slices, undo history, store effects | `state/` |
| [storage](modules/storage.md) | IndexedDB schema, autosave, migration | `storage/` |

## Research

| Doc | Topic |
|---|---|
| [research/performance.md](research/performance.md) | 2026-09-30 perf deep research: hotspots, tile model, WASM/Workers/WebGPU decision matrix |
| [research/vectorization.md](research/vectorization.md) | Raster→vector tracing ecosystem research; vtracer V1 pipeline replicated in `engine/trace/` |
| [research/ai-import.md](research/ai-import.md) | Adobe Illustrator compatibility of the SVG export (AI-safe profile) |
| [roadmap-vector-effects.md](roadmap-vector-effects.md) | Roadmap notes for future vector effects (point-in-time, not a decision record) |

`bench/PERFLOG.md` is the canonical performance change log (metric → before → after → Δ% →
cause) and the companion of `research/performance.md`.

## Related

- [`AGENTS.md`](../AGENTS.md) — engineering conventions (check chain, naming, ratchets, layers).
- [`openspec/`](../openspec/) — behavior specs and change history (13 capabilities).
- [`bench/`](../bench/) — engine benches (`npm run bench`), browser harness (`?bench=1`), `bench/wasm-flood/` Rust spike.
