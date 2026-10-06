# Tasks: add-cell-fields

## 1. Engine

- [x] 1.1 `core/field.ts`: `FieldSettings`, kinds, `normalizeField`, `sameField`, defaults;
      `PixelStyle.field` + `defaultDoc()`
- [x] 1.2 `effects/fields.ts`: `fieldAt` evaluators (size/align/offset) + unit tests
- [x] 1.3 `geometry/shape.ts`: composition in `pushCell` + gate extensions
- [x] 1.4 `grids/geometry.ts`: composition in `gridCellFragment`
- [x] 1.5 `core/doc-style.ts` + `geometry/elements.ts`: style equality + key;
      `features/canvas/stage-paint.util.ts` `plainSquarePreviewStyle`

## 2. Serialization, presets, nodes

- [x] 2.1 `core/project-parse.ts` clamp + round-trip
- [x] 2.2 `presets/index.ts`: normalize + `stylesEqual`
- [x] 2.3 `nodes/styles.node.ts`: `style.field` node
- [x] 2.4 Built-in seeds (Funnel, Vortex, Ripple, Sunray, Truchet Weave, Tides)

## 3. UI & i18n

- [x] 3.1 `features/settings-panel/field-section.component.tsx` mounted in the pixels block
- [x] 3.2 i18n `style.field.*` in en + ru

## 4. Tests & checks

- [x] 4.1 Field evaluator tests (determinism, kinds, bounds); geometry composition tests
      (funnel sizes, truchet rotation, offset bounds, gates, hex grid)
- [x] 4.2 Parse/preset round-trip; style-equality cases
- [x] 4.3 Full chain green (1352 tests, 0 lint errors, arch/knip/tsc clean); PERFLOG row;
      browser smoke test of the Field group and canvas output
