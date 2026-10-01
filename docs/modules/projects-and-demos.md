# Projects & demos — technical notes

## Scope

The home screen (`src/features/projects/`): project library gallery, Continue card, creation
flow — plus the demo registry (`src/engine/demo-project.ts` + 24 `demo-*.ts` builders) and
first-launch seeding (`src/storage/demo-seed.ts`). Persistence beneath:
[storage](storage.md); routing above: [app-shell](app-shell.md).

## Module map

| File | Role |
|---|---|
| `src/features/projects/home-screen.component.tsx` | `/` surface: Continue card, library grid, creation flow |
| `src/features/projects/project-card.component.tsx` | thumbnail, type badge, inline rename, duplicate/delete |
| `src/features/projects/project-dialog.component.tsx` + `new-project-dialog` | canvas setup: size/preset/grid type + rotation |
| `src/features/projects/examples-section.component.tsx` | demo gallery |
| `src/engine/demo-project.ts` | `DemoDef { id, name, build }` registry — lazy builds |
| `src/engine/demo-*.ts` | 21 pixel demo builders + `demo-media.ts` (vector/gradient sources) + `demo-kit.ts` |
| `src/storage/demo-seed.ts` | first-launch poster seed + idempotent `materializeDemo` |

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
`engine/sizes.ts` `SIZE_GROUPS` (ratio groups 1:1…2:1 plus named Game Boy/NES, each size
with an odd sibling variant).

**Demo registry** (header): "ready-made examples the home screen offers. Each def has a
stable id (the library entry id, `demo.`-prefixed) and a lazy build, so nothing is computed
until a thumbnail or an open click needs it." 25 demo ids total — pixel examples (poster,
invader, portrait, confetti, tone ramp, hexreef, diamond/iso/octasquare/rotated grid
showcases, mandala, kaleido, galaxy, wallpaper, …) plus vector and gradient demos sourcing
rasters from `demo-media.ts`. Display order: "the poster, growing grid scales, then the trace
sources". Thumbnails: pixel demos render `deserialize(doc)` through `renderThumbnailDataURL`;
media demos downsample their source raster ("media demos have no document to render").

**Seeding** (`demo-seed.ts`): on first launch the poster materializes into an empty library,
exactly once per install — guarded by the `glyph.demoSeeded` localStorage flag **and** a
non-empty-library check; called from app boot before the first route. `materializeDemo(def,
name)` is idempotent by construction: "loadProject(def.id) hit → return id — nothing is
overwritten", so re-opening a demo after the user renamed it just opens what's there.

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

`demo-project.test.ts` (registry, lazy builds), `demo-seed.test.ts` (seed-once behavior),
`projects.test.ts` (library CRUD the cards sit on).

## Related decisions

- [ADR-0006](../decisions/0006-indexeddb-persistence.md) — the library model demos live in.

## OpenSpec capabilities

- `openspec/specs/project-library/spec.md`; routing/ambient-save deltas in
  `openspec/changes/add-project-home/`.

## Known limitations

- Vector/gradient card thumbnails are broken images in dev (blob-URL lifecycle quirk,
  documented in `project-card.component.tsx`).
- No folders/collections in the library; sort is `updatedAt` desc only.
