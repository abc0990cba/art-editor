# Design: add-project-library

## Storage (`src/storage/projects.ts`)

- `openDb()`: IndexedDB `glyph-editor` v1, object store `projects` (keyPath `id`, index
  `by_updated` on `updatedAt`). `indexedDB` missing or `openDb` failing → module-level in-memory
  `Map<string, ProjectEntry>` fallback; every API works unchanged (async signature preserved).
- `ProjectEntry { id, name, createdAt, updatedAt, thumbnail, doc }` where `doc` is the
  `ProjectJSON` from `engine/project.ts`.
- API: `newProjectId()` (crypto.randomUUID with fallback), `listProjects()` (sorted newest
  first), `saveProject(entry)` (put), `loadProject(id)`, `deleteProject(id)`.
- Pure helpers exported for tests: `sortEntries(entries)` (updatedAt desc), `duplicateName(name,
  existing[])` (appends " copy", disambiguates " copy 2", " copy 3"…), `normalizeName(raw)`
  (trim, collapse to ≤ 40 chars, fallback "Untitled").

## Thumbnail (`engine/png.ts`)

`renderThumbnailDataURL(doc, maxSide = 320): string` — offscreen canvas at
`scale = maxSide / max(w, h)` (min 1 cell px), `drawGeometry` + background fill (same as PNG
export), `toDataURL('image/png')`.

## Dialog (`src/components/ProjectsDialog.tsx`)

Own async state: `entries | loading | error`. Actions:
- Save current: name input (`normalizeName`) + `renderThumbnailDataURL(currentDoc)` + `serialize`
  → `saveProject` → refresh list.
- Open: guard (painted cells present → inline confirm row per dialog, not per card) →
  `loadDoc(deserialize(entry.doc))` → close.
- Duplicate: new id, `duplicateName`, same thumbnail/doc, now timestamp.
- Rename: inline input on the card, Enter/blur commits.
- Delete: inline confirm (second click on the trash icon).
- New project: guard → `newDoc()` → close.

Store: `newDoc()` action sets `doc: defaultDoc()` (temporal records it as one undo step;
undo after new restores the previous canvas).

Mount/unmount of the dialog lives in `TopBar` (local state + folder icon button) so the modal
renders above everything with a backdrop.

## Testing

`storage/projects.test.ts`: pure helpers (sortEntries, duplicateName disambiguation,
normalizeName fallback/length) with the in-memory fallback path (no indexedDB in node) —
listProjects/saveProject/loadProject/deleteProject round trip through the fallback store.
Browser smoke covers the real IndexedDB path.
