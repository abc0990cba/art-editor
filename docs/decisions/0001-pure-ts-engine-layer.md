# ADR-0001 — Pure-TS engine layer without React

- Status: accepted
- Date: 2026-10-01 (decision in place since the initial `add-editor-core` change)
- Related: [architecture/overview](../architecture/overview.md); [doc-and-scene](../modules/doc-and-scene.md); `openspec/changes/archive/2026-09-13-add-editor-core/`

## Context

The editor's core is mathematics on cell buffers: document state, geometry construction,
dithering, symmetry, tracing. Preview canvas, SVG export and PNG export must produce
identical output from the same inputs. The project is built by AI agents, so the architecture
must make wrong layering mechanically detectable rather than a matter of review discipline.

## Decision

`src/engine/` is a pure TypeScript domain layer: no React, no DOM APIs, no imports from
`state/`, `storage/`, `features/`, `shared/` or `app/`. All interactions with the DOM happen
in features (e.g. the import dialog decodes a `File` into an `ImportBitmap` before the pure
import pipeline takes over; `glyph-preview.ts` defines its own `Raster` type instead of
`ImageData`). Enforcement is mechanical: dependency-cruiser rules (`engine-is-pure`,
`storage-only-engine`, `state-no-ui`, `features-no-cross-imports`) run in the mandatory check
chain (`npm run arch:check`). Sole exception: `engine/*.test.ts` may lift the store for
integration scenarios.

## Alternatives considered

- **React-centric engine (hooks + context holding geometry logic)** — rejected: geometry
  would re-run on React's schedule, memoization would be load-bearing for correctness, and
  export paths (SVG/PNG without React) would need a parallel implementation.
- **Class-based OOP domain** — rejected: the domain is buffer math; plain functions over
  typed arrays keep allocations explicit and benches honest.
- **Convention-only boundaries (no dependency-cruiser)** — rejected: AI-written code needs
  mechanically enforced rules; AGENTS.md conventions alone drift.

## Consequences

- Everything in `engine/` runs identically in the browser and in node — which is what makes
  `npm run bench` (vitest benches on node) representative and the perf ratchets
  (`perf-stress.test.ts`) possible.
- DOM-touching code must be pushed to feature boundaries (`shared/lib/`, dialogs), keeping a
  small, explicit surface of impure code.
- Engine APIs are `doc → doc` and `doc → geometry` functions; immutability contracts
  (documented per module) replace framework change detection.

## Evidence

- `.dependency-cruiser.cjs` — the four forbidden-dependency rules (comments in Russian,
  referencing AGENTS.md).
- [`src/engine/import/index.ts`](../../src/engine/import/index.ts) header — "Pure pipeline … with no DOM APIs"; the dialog owns
  decoding.
- [`src/engine/glyph/preview.ts`](../../src/engine/glyph/preview.ts) — custom `Raster` type instead of `ImageData` to stay
  DOM-free.
