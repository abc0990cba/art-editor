# Architecture overview

Ditherlab is a single-page web editor (React 19 + TypeScript + Vite) with three project kinds
that share one app shell: **pixel** projects (cell grids rendered as vector paths), and two
raster-to-vector workspaces — **vector** (image → traced SVG) and **gradient**
(image → fitted SVG gradients). The core principle of the pixel editor is a single geometry
pipeline: `buildGeometry(doc) → StyledPath[]` feeds canvas preview, PNG export and SVG export
alike, so the vector output is exactly what the preview shows (see
[render-pipeline.md](render-pipeline.md)).

## Layers

Five layers, enforced by dependency-cruiser (`.dependency-cruiser.cjs`), not by convention:

```mermaid
flowchart TD
    APP["app — shell: router, top bar, workspace, bench harness"]
    FEAT["features — vertical UI modules: canvas, tools, nodes-editor, layers,\nsettings-panel, glyph-editor, projects, export, import, vectorizer, gradient"]
    SHARED["shared — ui primitives + vendored shadcn, lib utils, i18n"]
    STATE["state — editor.store.ts: zustand + zundo, 16 slices"]
    STOR["storage — IndexedDB persistence: projects, presets, brushes, glyph tiles"]
    ENG["engine — pure TS domain: doc, scene, geometry, shapes, grids, nodes, trace..."]

    APP --> FEAT
    APP --> SHARED
    APP --> STATE
    FEAT --> SHARED
    FEAT --> STATE
    FEAT --> ENG
    FEAT --> STOR
    SHARED --> STATE
    STATE --> STOR
    STATE --> ENG
    STOR --> ENG
```

| Rule | Meaning |
|---|---|
| `engine` imports nothing above itself (`engine-is-pure`) | No React, no DOM, no store access. Exception: `engine/*.test.ts` may lift the store for integration scenarios. |
| `storage → engine` only (`storage-only-engine`) | Persistence serializes engine types; it never imports UI or state. |
| `state → engine + storage` (`state-no-ui`) | The store owns document state and library bindings; it never imports UI layers. |
| `features → { shared, engine, state, storage }` | Features consume the store and the persistence API freely; they must not import each other (`features-no-cross-imports`). |
| No feature → feature imports | Shared code goes up to `shared/`. Single documented exception: `settings-panel` assembles the right column out of `layers` and `nodes-editor`. |

## Engine module map

The engine (`src/engine/`) is the whole domain: document model, geometry, rasterization,
import/export math, the procedural node graph, and the two tracing pipelines. All of it runs
in plain TypeScript in any JS runtime — that is what makes node-side vitest benches
(`npm run bench`) representative of the shipped code.

The engine is grouped into domain folders — one folder per meaning, public facade at
`<domain>/index.ts`. The full annotated tree with entry points and per-domain doc links lives
in [engine-map.md](engine-map.md); the summary:

| Domain folder | Covers | Module doc |
|---|---|---|
| `core/` | Document + scene tree, project IO, sizes, stage themes | [doc-and-scene](../modules/doc-and-scene.md) |
| `geometry/` | `buildGeometry` (pixels/outline/metaball), RLE runs, marching squares | [geometry](../modules/geometry.md) |
| `output/` | PNG thumbnails, SVG + ASCII export | [render-outputs](../modules/render-outputs.md) |
| `shapes/` | Vector shape tool, rasterization, even-odd fill | [shapes](../modules/shapes.md) |
| `paint/` | Brush tips, flood fill | [paint-tools](../modules/paint-tools.md) |
| `grids/` + `cell-shapes/` | Grid lattices, rotation, per-grid cell geometry, ~28 cell forms | [grids](../modules/grids.md) |
| `effects/` | Symmetry, warp, jitter, selection transforms, stylize post-ops | [effects](../modules/effects.md) + [symmetry](../modules/symmetry.md) |
| `texture/` | Baked vector textures + fill patterns / dithered gradients | [texture](../modules/texture.md) + [dither-and-patterns](../modules/dither-and-patterns.md) |
| `dither/` | Threshold matrices, fields, blue noise, scan orders, screen engine | [dither-and-patterns](../modules/dither-and-patterns.md) |
| `glyph/` | Glyph tile sets, generators, bitmap font, ASCII raster | [glyphs](../modules/glyphs.md) |
| `import/` | Photo → cells: fit → quantize → dither → post effects | [image-import](../modules/image-import.md) |
| `color/` | Conversions, tone scales, palette presets + I/O | [palettes-and-presets](../modules/palettes-and-presets.md) |
| `presets/` | Editor preset families | [palettes-and-presets](../modules/palettes-and-presets.md) |
| `demos/` | Demo project factories (landing art, home screen) | [projects-and-demos](../modules/projects-and-demos.md) |
| `nodes/` (engine), `features/nodes-editor/` (UI) | Procedural node graph | [node-graph](../modules/node-graph.md) |
| `trace/` (engine), `features/vectorizer/` (UI) | Raster→SVG tracing | [vectorizer](../modules/vectorizer.md) |
| `gradient/` (engine), `features/gradient/` (UI) | Raster→SVG gradient fitting | [gradient-workspace](../modules/gradient-workspace.md) |
| root: `bench-doc.util.ts`, `perf-stress.test.ts` | Bench fixtures + PERFLOG ratchet tests | [research/performance](../research/performance.md) |

## Platform layers in brief

- **state** — one zustand store (`state/editor.store.ts`) composed of 16 slices, zundo undo
  history scoped to `{ doc }`, and module-level subscription effects (autosave, history
  budget, theme mirror). See [state-store](../modules/state-store.md) and
  [data-model.md](data-model.md).
- **storage** — IndexedDB database `glyph-editor` (schema v7) with typed object stores and a
  debounced ambient autosave. See [storage](../modules/storage.md).
- **features** — vertical UI modules. The two heavyweights are `canvas` (the render surface
  and all pointer interaction, [canvas-stage](../modules/canvas-stage.md)) and the coupled
  engine+feature pairs listed above.
- **app** — TanStack Router routes (`/` home, `/p/$projectId` workspace), top bar, hotkeys,
  i18n (EN/RU typed dictionaries), seven themes. See [app-shell](../modules/app-shell.md).
- **shared** — project UI primitives (`Chip`, `Slider`, `ConfirmDialog`, …) over vendored
  shadcn/ui, `lib/` utilities, i18n providers.

## Concurrency

Two production Web Workers (request-id + transferable-`ArrayBuffer` protocol), one per
raster-to-vector workspace: `features/vectorizer/trace.worker.ts` and
`features/gradient/gradient.worker.ts`. Everything else — geometry rebuilds, dithering,
autosave serialization — is main-thread by design, with costs tracked in
`bench/PERFLOG.md` ([research/performance.md](../research/performance.md) sizes what is worth
offloading). There is no WASM in the production bundle (see
[ADR-0003](../decisions/0003-rust-wasm-policy.md)).

## Toolchain

| Command | Role |
|---|---|
| `npm run dev` / `build` | Vite dev server; `build` = `tsc --noEmit` + Vite bundle |
| `npm run lint` / `lint:ai` | oxlint gate (0 errors; warnings advisory) |
| `npm run format` / `format:check` | oxfmt (100 cols, 2 spaces, no semicolons, sorted imports/Tailwind) |
| `npm run arch:check` | dependency-cruiser layer boundaries (table above) |
| `npm run knip` | dead exports/files/dependencies gate |
| `npm test` | vitest unit tests (colocated `*.test.ts`) |
| `npm run bench` | vitest engine benches → `bench/results/engine-bench.json` |
| `?bench=1&autorun=1` | browser harness driving the real store + CanvasStage (see [app-shell](../modules/app-shell.md)) |

TypeScript runs with `strict`, `verbatimModuleSyntax`, `noUnusedLocals/Parameters`, and
index-signature access rules; several checks (lint categories, size ratchets per file,
commit-lint) are documented in `AGENTS.md`.

## Behavior truth

Requirements and scenarios live in OpenSpec (`openspec/specs/` for the 13 current capability
specs, `openspec/changes/` for in-flight work and the archive). The division of labor between
that tree and this one is defined in [ADR-0007](../decisions/0007-openspec-docs-boundary.md).
