# Tasks: merge-same-color-objects

## 1. Engine

- [x] 1.1 `src/engine/core/scene-merge.ts`: `mergeObjsByColor(layers, scope?)` — per-layer
      grouping by (style key, palette value), candidate guards, tree-slot placement, id map

## 2. State & UI

- [x] 2.1 `state/doc.slice.ts`: `mergeSameColors()` — selection-scoped (or whole-doc) undoable
      step, selection remapped
- [x] 2.2 `features/layers/layers-panel.component.tsx`: action-row button; en/ru strings

## 3. Tests & gates

- [x] 3.1 `scene-merge.test.ts`: merge per (layer, color); guards (graph/links/multi-value/
      hidden/locked/style); tree position; id map; no-op
- [x] 3.2 Store integration: dotted import → merge → one object per color per layer, composite
      cells byte-identical, SVG path count per color
- [x] 3.3 Gates green: `format:check`, `lint`, `arch:check`, `knip`, `tsc --noEmit`, `npm test`
