# Tasks: add-editor-core

## 1. Scaffold

- [x] 1.1 Vite + React 19 + TypeScript project with strict tsconfig
- [x] 1.2 Tailwind CSS v4 via `@tailwindcss/vite`; dark theme base styles
- [x] 1.3 oxlint + Prettier + vitest wired into package.json scripts
- [x] 1.4 OpenSpec initialized for ZCode

## 2. Engine (pure TS + vitest)

- [x] 2.1 `doc.ts`: document model, palette helpers, resize/sub-change buffer transforms
- [x] 2.2 `symmetry.ts`: all 7 modes, `symmetryPoints`, out-of-bounds dropping, unit tests
- [x] 2.3 `marchingSquares.ts`: field → closed loops with interpolation, saddles, unit tests
- [x] 2.4 `geometry.ts`: shape-mode paths (uniform/per-corner radii, X/Y stretch), metaball fields
      (Wyvill kernels, connector capsules, per-color), loop smoothing; unit tests for merge + parity
- [x] 2.5 `floodfill.ts`, `svg.ts` (SVG serializer), `png.ts` (raster renderer), `project.ts`
      (JSON save/load/validate) with round-trip tests

## 3. State & i18n

- [x] 3.1 zustand store: doc slice + UI slice; zundo temporal (partialize doc, limit 100)
- [x] 3.2 Document actions: resize, setSub, paint/erase stamps, fill, connector add/remove, clear,
      style/metaball/symmetry setters — buffers replaced, never mutated
- [x] 3.3 i18n: typed EN dictionary, RU translation, provider + `useT`, persisted language

## 4. UI shell

- [x] 4.1 App layout: TopBar / ToolRail / CanvasStage / SettingsPanel (dark minimal theme)
- [x] 4.2 TopBar: W×H inputs (1–100), undo/redo, clear, language toggle, save/load/export buttons
- [x] 4.3 ToolRail: 8 tools with tooltips + shortcut hints; shortcut handling
- [x] 4.4 SettingsPanel sections: Color, Pixel Style, Metaball, Symmetry, Sub-cells & Canvas

## 5. Canvas stage

- [x] 5.1 Rendering: engine paths via Path2D, DPR-aware, checkerboard + bg, grid overlay, guides
- [x] 5.2 Pointer handling: zoom (wheel), pan (space/middle drag), cell hit-testing at any zoom
- [x] 5.3 Tool interactions with staging + rAF-throttled preview; commit on pointer-up (1 undo step)
- [x] 5.4 Connector two-click flow with capsule preview; eraser connector hit-removal

## 6. Export & persistence

- [x] 6.1 SVG export (bg option), PNG export (1×–16×), project JSON save/load
- [x] 6.2 localStorage autosave (debounced) + restore on boot; reset action (undoable)

## 7. Polish

- [x] 7.1 Full RU coverage, hotkey cheat-sheet in README
- [x] 7.2 `npm run lint`, `npm test`, `npm run build` green; manual smoke pass of all scenarios
