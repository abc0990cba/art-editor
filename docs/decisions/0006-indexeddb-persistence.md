# ADR-0006 — IndexedDB persistence with debounced ambient autosave

- Status: accepted
- Date: 2026-10-01 (IDB introduced in the storage milestone; schema v7 with typed projects)
- Related: [storage](../modules/storage.md); [data-model](../architecture/data-model.md); [projects-and-demos](../modules/projects-and-demos.md); `src/storage/`

## Context

Documents grew past the localStorage quota comfort zone (4096² buffers, per-element styles,
scene trees, embedded vector/gradient source rasters up to 4096² RGBA). The product also grew
a home-screen library (multiple named projects of three kinds) and needed ambient saving that
never blocks typing a stroke.

## Decision

Persist to **IndexedDB** (`glyph-editor`, version 7, one connection): object stores
`projects` (typed `pixel | vector | gradient` entries, `id` keyPath + `by_updated` index),
`presets`, `brushes`, `glyphTiles`, `vectorPresets`, plus legacy `autosave`/`vectorJobs`
slots that only the v6→v7 migration touches (it tags untyped records as `pixel` and promotes
the single legacy vector autosave slot into a real library entry). Every store degrades to an
in-memory `Map` when IndexedDB is unavailable or errors — the app stays functional, just
non-persistent.

Saving is **ambient**: every committed doc change lands in the bound library entry ~2 s after
the last edit (trailing debounce; immediate flush on `pagehide`/`visibilitychange`).
Small docs also mirror to localStorage (`glyph.doc`, only if ≤ 2 M chars) as the instant-boot
path. Thumbnails re-render at most every 30 s (always on explicit Ctrl+S). Records are
normalized on every read/write (`normalizeProject` rejects sources above 4096² or with wrong
buffer lengths; broken records are dropped, not propagated). One-time migration
(`migrate.ts`) adopts a pre-home-session draft before the first route renders.

## Alternatives considered

- **localStorage only** — rejected: 5 MB-class quota, synchronous main-thread writes,
  no indexes; unusable for 4096² docs and multi-project libraries.
- **File System Access API as primary** — rejected: no Safari support at decision time and a
  permission prompt model hostile to ambient saving; export remains the user-controlled path.
- **OPFS / sqlite-wasm** — rejected: more machinery than key-value-by-id needs; the access
  pattern is "put whole entry, getAll for the gallery".
- **Save only on explicit action** — rejected by product: demos, mobile sessions and
  accidental tab closes must not lose work; ambient autosave with a dirty flag won.

## Consequences

- Three persistence cadences exist by design: 2 s pixel autosave, 1.5 s vector/gradient
  session throttle, 30 s thumbnail ceiling — each tuned to its cost profile.
- The gallery reads whole entries (`getAll`) and normalizes defensively; a corrupt record
  degrades to absence (or "awaits import" for a broken raster source), never a crash.
- Continue-card state (`glyph.lastProjectId`) and migration markers stay in localStorage
  deliberately — `storage/` must not import from `state/`, so the live `DOC_KEY` constant is
  duplicated at the boundary and documented in `migrate.ts`.
- Demo projects are ordinary entries with stable `demo.`-prefixed ids: materialization is
  idempotent and never overwrites user renames.

## Evidence

- [`src/storage/db.ts`](../../src/storage/db.ts) — `DB_VERSION = 7`, store creation, `migrateKindedProjects`, memory
  fallback (`memoryOnly`).
- [`src/storage/projects.ts`](../../src/storage/projects.ts) — entry shapes, `normalizeProject` guards, `duplicateName`.
- [`src/state/store.effects.ts`](../../src/state/store.effects.ts) + [`src/state/project.slice.ts`](../../src/state/project.slice.ts) — debounce/throttle constants,
  `THUMBNAIL_MIN_INTERVAL_MS = 30_000`, localStorage mirror cap.
- [`src/storage/migrate.ts`](../../src/storage/migrate.ts) — one-time legacy adoption, marker keys.
