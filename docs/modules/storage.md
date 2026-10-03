# Storage — technical notes

## Scope

`src/storage/`: the IndexedDB layer (database `glyph-editor`, schema v7), typed project
entries, the preset/brush/glyph-tile/vector-preset stores, one-time legacy migration, and the
demo seeding helper. Decision record: [ADR-0006](../decisions/0006-indexeddb-persistence.md);
autosave flow: [state-store](state-store.md).

## Module map

| File | Role |
|---|---|
| [`src/storage/db.ts`](../../src/storage/db.ts) | connection, `DB_VERSION = 7`, store creation, v6→v7 migration, memory fallback |
| [`src/storage/projects.ts`](../../src/storage/projects.ts) | `ProjectEntry` (pixel/vector/gradient), CRUD, normalize guards, Continue-card keys |
| [`src/storage/presets.ts`](../../src/storage/presets.ts) | `PresetEntry`, normalize-on-access |
| [`src/storage/brushes.ts`](../../src/storage/brushes.ts) | `BrushPresetEntry` (tip + captured color) |
| [`src/storage/glyph-tiles.ts`](../../src/storage/glyph-tiles.ts) | `GlyphTileSetEntry` |
| [`src/storage/vector-presets.ts`](../../src/storage/vector-presets.ts) | trace-param presets |
| [`src/storage/migrate.ts`](../../src/storage/migrate.ts) | one-time adoption of pre-home sessions |
| [`src/storage/demo-seed.ts`](../../src/storage/demo-seed.ts) | first-launch poster + idempotent demo materialization |

## How it works

**Schema v7** (`db.ts`): object stores — `projects` (keyPath `id`, index `by_updated`),
`presets`, `brushes`, `glyphTiles`, `vectorPresets` (same pattern), plus legacy `autosave`
and `vectorJobs` (no index) that only the migration touches. The v6→v7 `migrateKindedProjects`
runs inside the versionchange transaction: untyped records get `kind: 'pixel'`, and the
single legacy vector autosave slot (`vectorJobs['current']`) is promoted into a real vector
library entry, then dropped.

**Failure policy**: any open error or missing IndexedDB sets `memoryOnly` — `openDb()`
resolves null and every storage module falls back to an in-memory `Map`. The app stays fully
functional; nothing persists. Ids: `crypto.randomUUID()` with a
`r-<timestamp36>-<rand>` fallback.

**Project entries** (`projects.ts`):

```ts
ProjectBase { id, name, kind: 'pixel'|'vector'|'gradient', createdAt, updatedAt, thumbnail }
PixelProjectEntry    { kind: 'pixel',    doc: ProjectJSON }
VectorProjectEntry   { kind: 'vector',   source: { width, height, data: ArrayBuffer } | null,
                       sourceName, params, svg: string | null, stats }
GradientProjectEntry { kind: 'gradient', … same shape + stats }
```

`normalizeProject` shape-checks on every read: records without `kind` predate typed projects
and are pixel documents; `storedSource` rejects width·height above 4096² and buffers whose
byte length ≠ w·h·4 — corrupted sources become `null` ("the project awaits an import")
instead of failing the load; records too broken to open return null and are filtered from the
gallery. Names: `normalizeName` (trim, ≤ 40 chars, ellipsis), `duplicateName`
("<name> copy", "<name> copy N"). Listing sorts `updatedAt` desc.

**Continue card**: `rememberOpenedProject`/`lastOpenedProjectId` use localStorage
`glyph.lastProjectId` — session-level, not part of the library data.

**One-time migration** (`migrate.ts`, before the first route): removes the dead `glyph.mode`
key; `claimLegacyDraft` reads the localStorage `glyph.doc` mirror (fallback: legacy IDB
`autosave['current'].json` — "used when localStorage was quota-evicted") and writes it into
the bound pixel entry (`glyph.projectId`) or adopts it as a new "Untitled"; guarded by the
`glyph.migratedV7` marker ("without it every reload would claim the same legacy draft
again"). Key names are duplicated here on purpose: "storage must not import from the state
layer (doc.slice.ts owns the live DOC_KEY constant)".

**Demo seeding**: `seedDemoProject()` — poster into an *empty* library, once per install
(localStorage `glyph.demoSeeded` + emptiness check); `materializeDemo` is idempotent via the
stable `demo.`-prefixed entry id ([projects-and-demos](projects-and-demos.md)).

## Data structures & invariants

- Every store entry passes through a normalize function on read *and* write
  (`normalizePresetConfig`, `normalizeBrush` + color regex, `normalizeGlyphTileSet`,
  `normalizeTraceParams`) — the DB is never trusted.
- All storage modules share the memory-fallback contract and the `reqToPromise` helper;
  none import from `state/` or `features/`.
- There are no `vector-job.ts`/`gradient-job.ts` modules — trace/gradient sessions persist as
  typed `projects` entries (the earlier architecture assumed a separate slot; v7 collapsed
  it).

## Performance characteristics

- Writes are whole-entry `put`s; the vector/gradient entry includes the source raster
  (multi-MB) — hence the session save throttle of 1.5 s (vs the pixel doc's 2 s debounce).
- Thumbnail re-renders are capped at one per 30 s (`THUMBNAIL_MIN_INTERVAL_MS`).
- `persistence.bench.ts` measures serialize/encode costs feeding those constants.

## Testing

`projects.test.ts`, `presets.test.ts`, `vector.test.ts`, `migrate.test.ts`,
`demo-seed.test.ts`, plus `test-storage.util.ts` (fake-indexedDB/memory harness) — the
storage layer is fully testable in node.

## Related decisions

- [ADR-0006](../decisions/0006-indexeddb-persistence.md) — the storage decision record.

## OpenSpec capabilities

- `openspec/specs/persistence/spec.md`, `openspec/specs/project-library/spec.md`; schema
  deltas in `openspec/changes/add-project-home/` (v6→v7).

## Known limitations

- Whole-entry reads/writes (no partial loads); revisited with the tile model.
- The `autosave`/`vectorJobs` stores linger as legacy slots (kept for migration only).
- No export/backup of the whole library in one action (per-project JSON export only).
