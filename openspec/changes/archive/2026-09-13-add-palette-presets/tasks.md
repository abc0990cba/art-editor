# Tasks: add-palette-presets

## 1. Engine

- [x] 1.1 `palettes.ts`: `PalettePreset`, `PALETTES` (PICO-8, Game Boy DMG, C64, Sweetie 16,
      Endesga 32, Classic 12) with accurate hex values
- [x] 1.2 `doc.ts`: default palette sourced from the `classic12` preset
- [x] 1.3 `store.ts`: `applyPalette` action (undoable palette replacement)

## 2. UI

- [x] 2.1 `SettingsPanel`: preset list with swatch-strip previews and equality-based highlight
- [x] 2.2 `i18n`: `palette.presets` EN/RU

## 3. Tests & polish

- [x] 3.1 `palettes.test.ts`: preset invariants (unique valid hex, sizes), index-recolor
      semantics, project round trip
- [x] 3.2 Browser smoke: apply PICO-8 → recolor + undo restores; archive the change
