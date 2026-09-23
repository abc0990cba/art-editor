# Tasks: add-element-styles

## 1. Engine & document model

- [x] 1.1 `src/engine/doc.ts`: `StyleScope`, `ElementStyle` (style + renderMode + connectivity + metaball + texture), `Doc.styleScope/elements/cellObj`, `Link.obj`, `elementFromDoc()`, `sameElementStyle()`, defaults
- [x] 1.2 `src/engine/doc.ts`: `resizeDoc`/`changeSub` carry `cellObj`; `src/engine/grids.ts` `convertGridDoc` resamples `cellObj` and keeps `Link.obj`
- [x] 1.3 `src/engine/geometry.ts`: `Staging.objs`, element-mode grouping (merge equal styles, obj-0 fallback group) routing to existing builders, incl. `gridBuildGeometry`
- [x] 1.4 `src/engine/project.ts`: schema v2, RLE `cellObj`, element normalizer, v1→v2 migration
- [x] 1.5 `src/engine/presets.ts`: `styleScope` in `PresetConfig` (fromDoc/normalize/matches/builtin base)

## 2. State

- [x] 2.1 `src/state/store.ts`: `setStyleScope` with materialization; `paintCells`/`fillAt`/`addLinks` stamp element ids; `clear` resets them
- [x] 2.2 `src/state/store.ts`: selection state + `selectElements/toggleSelection/clearSelection/selectAll`, `restyleSelection`, `deleteSelection`, `moveSelection`, element GC + selection pruning, `setTool` clears selection
- [x] 2.3 history budget accounts for the extra 4 bytes/cell once `cellObj` is allocated

## 3. UI

- [x] 3.1 `src/components/ToolRail.tsx`: Select tool entry (icon, `V`), no-op settings body
- [x] 3.2 `src/components/CanvasStage.tsx`: select/drag interactions, staging `objs` preview, selection highlight + hover affordance, Escape/Del wiring
- [x] 3.3 `src/components/SettingsPanel.tsx`: scope switch; Style + Texture sections target the selection in element scope
- [x] 3.4 `src/App.tsx` hotkeys (`V`, Delete, Ctrl/Cmd+A); `src/i18n/en.ts` + `ru.ts` strings

## 4. Tests & polish

- [x] 4.1 `src/engine/elements.test.ts`: freeze, identical-style merge, restyle isolation, move, resize/sub/grid-change carry, scope switching
- [x] 4.2 `src/engine/project.test.ts` updates: v2 round-trip, RLE, v1 migration
- [x] 4.3 Global-scope parity: `buildGeometry` output byte-identical to pre-change behavior in global mode
- [x] 4.4 `oxlint`, `tsc --noEmit`, `vitest run`, `vite build` green
