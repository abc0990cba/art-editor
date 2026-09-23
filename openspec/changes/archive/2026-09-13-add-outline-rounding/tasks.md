# Tasks: add-outline-rounding

## 1. Engine

- [x] 1.1 `doc.ts`: `RenderMode` type, `renderMode` on `Doc`, drop `MetaballSettings.enabled`
- [x] 1.2 `outline.ts`: binary padded field, collinear merge, 90° circular fillets, compound path
- [x] 1.3 `geometry.ts`: dispatch by `renderMode`; outline mode reuses capsule-stroke links
- [x] 1.4 `project.ts`: serialize `renderMode`, loader fallback from `metaball.enabled`

## 2. State & UI

- [x] 2.1 `store.ts`: `setRenderMode` action (undoable), default `'pixels'`
- [x] 2.2 `SettingsPanel`: three-way mode selector, conditional controls per mode
- [x] 2.3 `i18n`: mode labels EN/RU

## 3. Tests & polish

- [x] 3.1 Update metaball tests to `renderMode`; new outline tests (seam, L-shape, isolated,
      sub-cells, migration)
- [x] 3.2 `oxlint` + `tsc` + `vitest` + `build` green; browser smoke of all three modes; archive
