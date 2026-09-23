# Tasks: add-editor-presets

## 1. Engine & storage

- [x] 1.1 `src/engine/presets.ts`: `PresetConfig` / `EditorPreset` types, `presetFromDoc`,
      `normalizePresetConfig` (clamping like `deserialize`), `configMatchesState`, 8 built-ins
- [x] 1.2 `src/storage/db.ts`: shared `glyph-editor` opener at schema version 2 creating both
      stores; `projects.ts` refactored onto it (public API unchanged)
- [x] 1.3 `src/storage/presets.ts`: IDB CRUD + in-memory fallback + `clearPresetsForTests`
- [x] 1.4 `src/engine/presetPreview.ts`: procedural sample artwork rendered through the preset
      config, memoized

## 2. State & UI

- [x] 2.1 `store.ts`: `presets` state, `applyPreset` (single undoable transition + symmetry),
      `loadPresets` / `createPreset` / `overwritePreset` / `renamePreset` / `deletePreset` /
      `duplicatePreset`; `App.tsx` loads presets on mount
- [x] 2.2 `PresetsDialog.tsx`: save-current input, card grid (built-ins badged first), apply,
      duplicate, overwrite, inline rename, inline-confirm delete, active highlight
- [x] 2.3 `SettingsPanel.tsx`: Presets section (rows with previews, click to apply, Manage button)
- [x] 2.4 `i18n`: `presets.*` + `presetName.*` EN/RU

## 3. Tests & polish

- [x] 3.1 `engine/presets.test.ts`: built-in validity, normalization clamps, snapshot→match
      round trip
- [x] 3.2 `storage/presets.test.ts`: CRUD + fallback store
- [x] 3.3 Browser smoke: apply each built-in, CRUD round trip, both themes/languages;
      lint/tsc/vitest/build; archive
