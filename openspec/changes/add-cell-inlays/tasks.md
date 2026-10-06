# Tasks: add-cell-inlays

## 1. Engine

- [x] 1.1 `color/shade.ts`: `shadeHex`/`tintHex` (+ unit tests)
- [x] 1.2 `core/doc.ts` (or `core/inlay.ts` re-export if ratchet-locked): `InlaySettings`,
      `PixelStyle.inlay`, `defaultDoc()` defaults
- [x] 1.3 `geometry/inlay.ts`: inlay color resolution (`inlayColorOf`) + fragment emitter
- [x] 1.4 `geometry/shape.ts`: `inlayGroups`, gate extension, `pushCell` hook, emission order
- [x] 1.5 `geometry/index.ts`: `stagedCellPath` inlay parity; `grids/geometry.ts`: `gridPixels`
      inlay parity
- [x] 1.6 `core/doc-style.ts` `samePixelStyle` + `geometry/elements.ts` style key: inlay fields

## 2. Serialization, presets, nodes

- [x] 2.1 `core/project-json.ts` / `core/project-parse.ts`: write + clamp + round-trip
- [x] 2.2 `presets/index.ts`: `normalizePresetConfig` clamps; `configMatchesState` awareness
- [x] 2.3 `nodes/styles.node.ts`: `style.pixel` inlay params
- [x] 2.4 Built-in seeds in `presets/lists-forms.ts`

## 3. UI & i18n

- [x] 3.1 `features/settings-panel/inlay-section.component.tsx` (enable toggle, form grid,
      sliders, color chips, slot swatches, depth) mounted in `style-section` pixels block,
      wired via `useStyleTarget`
- [x] 3.2 `style-previews.component.tsx`: preview shows the inlay (renders through
      `buildGeometry`, no code change needed)
- [x] 3.3 i18n `style.inlay.*` keys in `en.messages.ts` + `ru.messages.ts`

## 4. Tests & checks

- [x] 4.1 Geometry tests: inlay groups emitted after base, per-cell composition with
      tone/spread, `none` keeps run-merge byte-compat, hex-grid inlay
- [x] 4.2 Parse/normalize round-trip + clamping tests; `samePixelStyle` cases
- [x] 4.3 Full chain green (format/lint/arch/knip/tsc/test: 1323 tests, 0 lint errors);
      bench re-run + PERFLOG row; browser smoke test of the panel group and canvas output
