# Design: add-project-home

## Context

Today the workspace is chosen by a global `mode: 'pixel' | 'vector'` flag in `ui.slice`
(localStorage `glyph.mode`), the vector tracer persists one session in `vectorJobs['current']`
(`storage/vector-job.ts`), and the pixel library in `storage/projects.ts` stores flat
`ProjectEntry { id, name, createdAt, updatedAt, thumbnail, doc }`. Boot restores the pixel doc from
autosave and overlays `ProjectsDialog variant="home"` when an autosave exists. There is no router.

## Data model

`ProjectEntry` becomes a discriminated union; `normalizeProject` on read upgrades legacy flat
records so every consumer can switch on `kind`:

```ts
interface ProjectBase { id: string; name: string; kind: ProjectKind; createdAt: number; updatedAt: number; thumbnail: string }
interface PixelProjectEntry extends ProjectBase { kind: 'pixel'; doc: ProjectJSON }
interface VectorProjectEntry extends ProjectBase { kind: 'vector'; source: { width: number; height: number; data: ArrayBuffer } | null; sourceName: string; params: TraceParams; svg: string | null; stats: TraceStats | null }
```

IndexedDB bumps to version 7: the `projects` store keeps its shape (records are schemaless), the
migration is a one-time pass that tags existing records `kind: 'pixel'` and converts
`vectorJobs['current']` into a vector entry (then deletes the legacy slot). `normalizeProject`
re-runs on every read as a safety net for records written before the migration ran.

## Routing

TanStack Router with code-based routes (no vite plugin, no generated route tree — knip-friendly):

- `/` → home screen.
- `/p/$projectId` → editor; the project is loaded by id and its `kind` picks the workspace. A missing
  id redirects to `/` (soft fallback, e.g. project deleted in another tab).
- Search params (`validateSearch`, hand-rolled validation, all optional): `panel` (right panel
  collapsed), `node` (node editor `split | overlay`), `nodeSplit` (0..1). Written via `navigate`
  with `replace: true` so Back/Forward stays clean.
- Theme, language and layout prefs stay in localStorage — they are preferences, not session state.
- SPA fallback: Vite dev/preview serve `index.html` for unknown paths out of the box; static hosting
  needs the usual one-line rewrite (noted in tasks, config not part of this repo).

## Ambient saving

`store.effects.ts` keeps the 2 s debounced autosave but the write path changes:

- Pixel: serialize → write into the bound `PixelProjectEntry` (`saveProject`), refresh thumbnail at
  most every N writes and on exit-to-home; the localStorage mirror `glyph.doc` stays as the instant
  boot cache for the Continue card.
- Vector: the existing 1.5 s throttled `saveVectorJob` write is redirected into the bound
  `VectorProjectEntry`.
- `pagehide` flushes pending timers synchronously-ish (fire-and-forget IDB put).
- `projectDirty` remains as "doc differs from last write" indicator; the Save button is removed,
  Ctrl+S forces an immediate write.

## App shell

`app.component.tsx` renders by route: home screen, or the editor surface — pixel tree
(`ToolRail + CanvasStage + …`) for `kind: 'pixel'`, `VectorWorkspace` for `kind: 'vector'`.
The home overlay moves out of the pixel-only branch. Top bar: home button leftmost (replaces the
folder button), project name pill, then existing document controls; `ModeSwitch` and Save are
removed; the vectorize bridge ("Vectorize" in the export popover) creates a **new** vector project
seeded with the rendered canvas and navigates to it.

## Migration of user data

One-time, on boot, before the router resolves the project:

1. Legacy pixel autosave that matches no library entry → new draft pixel project "Untitled".
2. `vectorJobs['current']` → new vector project named from `sourceName`.
3. `localStorage['glyph.mode']` deleted.

After this there is no unaddressed work: every document lives in a library entry and is reachable
via URL.

## Risks / trade-offs

- Vector entries are ~16 MB each (2048² RGBA). IndexedDB quota is ample; writes stay throttled at
  1.5 s. Documented in the persistence spec delta.
- Re-trace on open costs hundreds of ms; mitigated by showing the persisted SVG immediately (the
  existing hook already re-traces in the background).
- `projects-dialog.component.tsx` sits on a size ratchet: home/gallery UI is written into new files
  (`home-screen.component.tsx`, `project-card.component.tsx`) and the modal variant is deleted.
- Removing Save touches hotkeys and top-bar tests; covered in tasks step 3.
