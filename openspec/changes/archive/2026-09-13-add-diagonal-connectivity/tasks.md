# Tasks: add-diagonal-connectivity

## 1. Engine

- [x] 1.1 `doc.ts`: `Connectivity` type, `connectivity` on `Doc` (default `'edge'`)
- [x] 1.2 `outline.ts`: iso `0.49` under corner connectivity; junction scan; bridge overlays
- [x] 1.3 `geometry.ts`: metaball junction kernels under corner connectivity
- [x] 1.4 `project.ts`: serialize/deserialize `connectivity` with `edge` fallback

## 2. State & UI

- [x] 2.1 `store.ts`: `setConnectivity` action
- [x] 2.2 `SettingsPanel`: connectivity segmented control (outline/metaball modes only)
- [x] 2.3 `i18n`: `connectivity.*` EN/RU

## 3. Tests & polish

- [x] 3.1 Unit tests: outline pinch/edge subpaths, bridge overlay, metaball junction merge,
      project round trip
- [x] 3.2 `oxlint` + `tsc` + `vitest` + `build` green; browser smoke; archive the change
