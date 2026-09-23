# Tasks: add-rich-color-picker

## 1. Engine

- [x] 1.1 `color.ts`: `hsvToRgb`/`rgbToHsv`/`hsvToHex`/`hexToRgb`/`hexToHsv`/`normalizeHex`
- [x] 1.2 `color.test.ts`: round trips, parsing, formatting

## 2. Component & state

- [x] 2.1 `ColorPicker.tsx`: radial wheel canvas, brightness slider, hex field, preview, markers
- [x] 2.2 Store: `recent` slice + `pushRecent`, hooks in `paintCells`/`fillAt`, persistence
- [x] 2.3 `SettingsPanel`: picker toggle on the swatch, Recent row
- [x] 2.4 `i18n`: picker labels EN/RU

## 3. Tests & polish

- [x] 3.1 Browser smoke: wheel drag live update, hex commit, recent persistence, both themes
- [x] 3.2 lint/tsc/vitest/build green; archive the change
