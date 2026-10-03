# Projects & demos — technical notes

## Scope

The home screen (`src/features/projects/`): project library gallery, Continue card, creation
flow — plus the demo registry ([`src/engine/demos/index.ts`](../../src/engine/demos/index.ts)
+ 20 generator files) and first-launch seeding
([`src/storage/demo-seed.ts`](../../src/storage/demo-seed.ts)). Persistence beneath:
[storage](storage.md); routing above: [app-shell](app-shell.md).

## Module map

| File | Role |
|---|---|
| [`src/features/projects/home-screen.component.tsx`](../../src/features/projects/home-screen.component.tsx) | `/` surface: Continue card, library grid, creation flow |
| [`src/features/projects/project-card.component.tsx`](../../src/features/projects/project-card.component.tsx) | thumbnail, type badge, inline rename, duplicate/delete |
| [`src/features/projects/project-dialog.component.tsx`](../../src/features/projects/project-dialog.component.tsx) + [`new-project-dialog.component.tsx`](../../src/features/projects/new-project-dialog.component.tsx) | canvas setup: size/preset/grid type + rotation |
| [`src/features/projects/examples-section.component.tsx`](../../src/features/projects/examples-section.component.tsx) + [`examples-scroller.component.tsx`](../../src/features/projects/examples-scroller.component.tsx) | demo gallery |
| [`src/engine/demos/index.ts`](../../src/engine/demos/index.ts) | `DemoDef { id, name, build }` registry (`DEMO_PROJECTS`, `POSTER_DEMO`) — lazy builds |
| [`src/engine/demos/kit.ts`](../../src/engine/demos/kit.ts) | shared drawing kit: sparse ink grids, dither screens, deterministic noise → scene JSON |
| [`src/engine/demos/media.ts`](../../src/engine/demos/media.ts) | `vectorDemoSource`/`gradientDemoSource` RGBA rasters for the trace demos |
| [`src/engine/demos/poster.ts`](../../src/engine/demos/poster.ts) | the first-launch poster (`demoProjectJSON`, `DEMO_PROJECT_NAME`, 200×100) |
| [`src/engine/demos/grids.ts`](../../src/engine/demos/grids.ts) | diamond / iso / octagon / rotated-grid showcases (4 demos) |
| [`src/engine/demos/invader.ts`](../../src/engine/demos/invader.ts) · [`portrait.ts`](../../src/engine/demos/portrait.ts) · [`confetti.ts`](../../src/engine/demos/confetti.ts) · [`tone.ts`](../../src/engine/demos/tone.ts) | early pixel demos |
| [`src/engine/demos/hexreef.ts`](../../src/engine/demos/hexreef.ts) · [`kaleido.ts`](../../src/engine/demos/kaleido.ts) · [`mandala.ts`](../../src/engine/demos/mandala.ts) · [`galaxy.ts`](../../src/engine/demos/galaxy.ts) | pattern demos |
| [`src/engine/demos/cubist.ts`](../../src/engine/demos/cubist.ts) · [`wallpaper.ts`](../../src/engine/demos/wallpaper.ts) · [`nodegarden.ts`](../../src/engine/demos/nodegarden.ts) · [`constellation.ts`](../../src/engine/demos/constellation.ts) | 128² scene demos |
| [`src/engine/demos/neoncity.ts`](../../src/engine/demos/neoncity.ts) · [`tripeaks.ts`](../../src/engine/demos/tripeaks.ts) · [`cascade.ts`](../../src/engine/demos/cascade.ts) · [`lava.ts`](../../src/engine/demos/lava.ts) | 96–128² scene demos |
| [`src/engine/demos/dollar.ts`](../../src/engine/demos/dollar.ts) · [`landscape.ts`](../../src/engine/demos/landscape.ts) | large-format demos (192², 512²) |
| [`src/storage/demo-seed.ts`](../../src/storage/demo-seed.ts) | first-launch poster seed + idempotent `materializeDemo` |

## How it works

**Home screen**: state machine `{ loading | error | ready(entries) }`; `refresh()` lists
projects; the Continue candidate is `lastOpenedProjectId()` matched against entries (data-url
in localStorage, [storage](storage.md)). Per-card actions: open (navigate `/p/$projectId`),
duplicate (`duplicateName` uniqueness), inline rename (`normalizeName`), delete
(`ConfirmDialog`). "Only its own buttons navigate — the home screen has no backdrop to
dismiss" (startup-catalog convention); navigation goes through the injected `onOpen` callback
so the feature stays router-agnostic.

**Creation**: `createPixelEntry` snapshots the already-applied store doc via `serialize` and
renders a best-effort thumbnail ("the card shows the placeholder until the first save");
vector/gradient creation via `newVectorEntry`/`newGradientEntry`. Size presets come from
[`src/engine/core/sizes.ts`](../../src/engine/core/sizes.ts) `SIZE_GROUPS` (ratio groups
1:1…2:1 plus named Game Boy/NES, each size with an odd sibling variant).

**Demo registry** ([`src/engine/demos/index.ts`](../../src/engine/demos/index.ts) header):
"ready-made examples the home screen offers. Each def has a stable id (the library entry id,
`demo.`-prefixed) and a lazy build, so nothing is computed until a thumbnail or an open click
needs it." 25 demo ids total — 23 pixel examples (poster, invader, portrait, confetti, tone
ramp, hexreef, diamond/iso/octasquare/rotated grid showcases, mandala, kaleido, galaxy,
cubist, wallpaper, nodegarden, constellation, neoncity, tripeaks, cascade, lava, dollar,
landscape) plus `demo.vector` and `demo.gradient` sourcing rasters from
[`src/engine/demos/media.ts`](../../src/engine/demos/media.ts) (2× supersampled RGBA buffers
with `DEFAULT_TRACE_PARAMS` / `DEFAULT_GRADIENT_PARAMS`). Display order: "the poster, growing
grid scales, then the trace sources". Thumbnails: pixel demos render `deserialize(doc)`
through `renderThumbnailDataURL`; media demos downsample their source raster ("media demos
have no document to render").

The 20 generator files are pure functions returning `ProjectJSON` (the serialized scene), so
demos build the same pixel-for-pixel on every client —
[`src/engine/demos/kit.ts`](../../src/engine/demos/kit.ts) supplies the shared drawing kit
(sparse ink on a fixed-size square grid, ordered-dither screens, deterministic noise). A
`build` returns a `DemoContent` tagged by project kind: `{ kind: 'pixel', doc }`,
`{ kind: 'vector', source, sourceName, params }` or `{ kind: 'gradient', … }`.

**Landing artwork**: `scripts/generate-landing-art.ts` (`npm run art:generate`) imports
`DEMO_PROJECTS` from [`src/engine/demos/index.ts`](../../src/engine/demos/index.ts) and
renders picked demos through the engine itself — `deserialize` +
[`src/engine/core/project.ts`](../../src/engine/core/project.ts), `docExtent` from
[`src/engine/core/doc.ts`](../../src/engine/core/doc.ts), `buildSvg` from
[`src/engine/output/svg.ts`](../../src/engine/output/svg.ts) — so the landing shows exactly
what the editor draws.

**Seeding** ([`src/storage/demo-seed.ts`](../../src/storage/demo-seed.ts)): on first launch
the poster materializes into an empty library, exactly once per install — guarded by the
`glyph.demoSeeded` localStorage flag **and** a non-empty-library check; called from app boot
before the first route. `materializeDemo(def, name)` is idempotent by construction:
"loadProject(def.id) hit → return id — nothing is overwritten", so re-opening a demo after
the user renamed it just opens what's there.

**Ambient autosave interplay**: demos are ordinary `ProjectEntry` rows — opening one binds it
(`openProject`) and the store autosave writes edits back into the demo entry like any
project; materialization is the only write outside the store.

## Invariants & constraints

- Demo ids are stable and namespaced (`demo.`) — they are library entry ids.
- Seeding must never overwrite a non-empty library (user content wins).
- Pixel card thumbnails come from the stored entry; vector/gradient cards render the stored
  `svg` via a temporary blob URL (revoked/recreated per card lifecycle).

## Performance characteristics

Home screen cost = `listProjects()` (getAll + normalize) + thumbnail decode; demo builds are
lazy and cached by nature (built once into an entry). No benches target the gallery; boot
cost is dominated by storage read + first geometry build.

## Testing

- [`src/engine/demos/demos.test.ts`](../../src/engine/demos/demos.test.ts) — registry
  (stable unique `demo.` ids, poster def pinned), every pixel demo deserializes into a scene
  document of its own size, every build is deterministic, grid demos restore their lattices,
  trace demos ship a source raster with default params.
- [`src/storage/demo-seed.test.ts`](../../src/storage/demo-seed.test.ts) — seed-once
  behavior.
- [`src/storage/projects.test.ts`](../../src/storage/projects.test.ts) — library CRUD the
  cards sit on.

## Related decisions

- [ADR-0006](../decisions/0006-indexeddb-persistence.md) — the library model demos live in.

## OpenSpec capabilities

- `openspec/specs/project-library/spec.md`; routing/ambient-save deltas in
  `openspec/changes/add-project-home/`.

## Known limitations

- Vector/gradient card thumbnails are broken images in dev (blob-URL lifecycle quirk,
  documented in
  [`src/features/projects/project-card.component.tsx`](../../src/features/projects/project-card.component.tsx)).
- No folders/collections in the library; sort is `updatedAt` desc only.
