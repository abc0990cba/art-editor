# Tasks: add-project-library

## 1. Storage & engine

- [x] 1.1 `src/storage/projects.ts`: IDB wrapper + in-memory fallback + `sortEntries` /
      `duplicateName` / `normalizeName` helpers
- [x] 1.2 `engine/png.ts`: `renderThumbnailDataURL(doc, maxSide)`
- [x] 1.3 `store.ts`: `newDoc` action

## 2. UI

- [x] 2.1 `ProjectsDialog.tsx`: gallery modal (save current, cards with thumbnail/name/date,
      open/duplicate/rename/delete with guards, new project, loading/empty/error states)
- [x] 2.2 `TopBar`: Projects button (folder icon) + dialog mount
- [x] 2.3 `i18n`: `projects.*` EN/RU

## 3. Tests & polish

- [x] 3.1 `storage/projects.test.ts`: helpers + fallback-store round trip
- [x] 3.2 Browser smoke: save → reload → open → duplicate → rename → delete, both themes;
      lint/tsc/vitest/build; archive
