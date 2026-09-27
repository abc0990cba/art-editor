# Tasks: add-project-home

## 1. Data model & migration

- [x] 1.1 `src/storage/projects.ts`: discriminated `ProjectEntry` union (`kind: 'pixel' | 'vector'`), `normalizeProject` upgrade-on-read, create/update helpers for both kinds
- [x] 1.2 IndexedDB v6→v7 migration in `src/storage/db.ts`: tag legacy records `kind: 'pixel'`, convert `vectorJobs['current']` into a vector entry, delete the legacy slot; `src/storage/projects.test.ts` / `vector.test.ts` coverage for normalize + migration

## 2. Router & state

- [x] 2.1 Add `@tanstack/react-router`; code-based routes `/` and `/p/$projectId` with typed optional search params (`panel`, `nodeOpen`, `node`, `nodeSplit`), `replace` writes, fallback-to-home for unknown ids
- [x] 2.2 `src/state/ui.slice.ts`: remove `mode` / `glyph.mode` / `setMode`; panel + node-editor view state follows search params
- [x] 2.3 `src/state/project.slice.ts` + `store.effects.ts`: autosave writes into the bound entry (pixel doc / vector session), thumbnail throttled + on exit, `pagehide` flush, Ctrl+S forces a write
- [x] 2.4 `src/state/vector.slice.ts` + legacy `src/storage/vector-job.ts` removed: the vector session loads from / writes to the bound `VectorProjectEntry`

## 3. App shell & top bar

- [x] 3.1 `src/app/`: render by route — home, pixel tree (`pixel-workspace.component.tsx`), `VectorWorkspace` (by project kind); home leaves the pixel-only overlay branch
- [x] 3.2 `src/app/top-bar-*.component.tsx`: home button leftmost replaces folder; remove `mode-switch.component.tsx`, the Save button and the folder modal variant; "Vectorize" export action creates a new vector project from the canvas and navigates to it
- [x] 3.3 i18n keys `home.*`, `project.kind.*` in `en.messages.ts` + `ru.messages.ts` (dead keys pruned)

## 4. Home screen

- [x] 4.1 `src/features/projects/home-screen.component.tsx` + `project-card.component.tsx`: Continue card, card grid (type badge, size, date), open/rename/duplicate/delete with `ConfirmDialog`
- [x] 4.2 `new-project-dialog.component.tsx` with type choice (pixel: name/size/grid via existing `ProjectDialog`; vector: name) → creates the entry, navigates to `/p/<id>`

## 5. Vector projects end-to-end

- [x] 5.1 Opening a vector project: restore source/params/SVG instantly, background re-trace via the existing worker hook
- [x] 5.2 Import into the open vector project (button / drag&drop / paste routed by project kind)

## 6. Migration & polish

- [x] 6.1 Boot migration (`src/storage/migrate.ts`, once-per-boot marker): legacy pixel autosave with no matching entry → draft pixel project; drop `glyph.mode`
- [x] 6.2 Empty states (no projects, empty vector import), browser smoke test (home → create → editor → reload → fallback → history → view params → vector persistence), design-review pass, full gate green (`format:check`, `lint`, `arch:check`, `knip`, `tsc`, `test`)
