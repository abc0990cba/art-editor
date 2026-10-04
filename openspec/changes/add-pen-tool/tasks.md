# Tasks: add-pen-tool

## 1. Engine

- [x] 1.1 `src/engine/curves/`: model (anchor/handle path + `d` round-trip), flatten (adaptive,
      split, nearest), edit ops (hit-test, move/handle/bend/insert/delete/smooth), simplify, raster
- [x] 1.2 `src/engine/nodes/bezier.node.ts`: `source.bezier` regenerating the committed ink from
      params (parity with the preview tested in `nodes.test.ts`)

## 2. State & canvas

- [x] 2.1 `state/pen.slice.ts` (draft outside history, `commitPenReplace`) + `penWidth`/`penSnap`
      tool options; canvas delegation (`canvas-stage` branches, overlay draw, double-click)
- [x] 2.2 `features/canvas/`: `use-pen-tool.hook.ts` + `use-pen-actions.hook.ts` (gestures,
      commit, keyboard), `stage-pen.util.ts` (skeleton overlay, lattice ink), `pen-ink.util.ts`
      (ShapePaint-aware ink build); gesture helpers extracted to `stage-gestures.util.ts`

## 3. UI & i18n

- [x] 3.1 Tool rail entry (icon, `F` shortcut, order), settings popover (width slider, snap
      chips, path actions, hints), ShapePaint fill/stroke controls, tool-settings preview
- [x] 3.2 en/ru strings for the tool, its options and actions

## 4. Docs & gates

- [x] 4.1 `docs/modules/curves.md` + `docs/architecture/engine-map.md` (table, DAG, doc index)
- [x] 4.2 Gates green: `format:check`, `lint`, `arch:check`, `knip`, `tsc --noEmit`, `npm test`
- [x] 4.3 Browser smoke: draw → edit → Enter → double-click re-edit → re-commit; undo; snap chips
