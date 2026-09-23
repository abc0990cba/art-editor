# Tasks: add-fill-patterns

## 1. Engine

- [x] 1.1 `src/engine/fillpatterns.ts`: `FillPatternId`/`FillGradient`/`FillStyle` types, canonical Bayer 2×2/4×4/8×8 matrices via recursive expansion, `patternAt` (ordered dither, positional noise, stripes, dots), `gradientAt` (flat/vertical/horizontal/diagonal/reverse-diagonal/radial), `patternCoord` (row-major buffer coords, sub-cell resolution on square grids), `applyFillStyle` (per-region 0/1 color assignment, per-region bbox, seed anchor for radial)
- [x] 1.2 `src/engine/floodfill.ts`: extract shared grid topology; add `floodRegion` (connected region indices without writing); keep `floodFillDoc` behavior identical

## 2. State

- [x] 2.1 `src/state/store.ts`: `fillStyle` UI state + `patchFillStyle`; `fillAt` applies the pattern per flooded region (second color resolved into the palette, no-op fills stay out of history); `paintFillRegion` for the radial sector/ring seed sets; element-scope `cellObj` attribution shared by both paths

## 3. UI

- [x] 3.1 `src/components/FillSettings.tsx`: style switch, pattern grid, transition chips, density slider, second color + swap, live preview canvas
- [x] 3.2 `src/components/ToolRail.tsx`: fill branch in the per-tool settings panel; `src/components/CanvasStage.tsx`: sector/ring scope routes through `paintFillRegion`
- [x] 3.3 `src/i18n/en.ts` + `ru.ts`: fill style/pattern/transition/density/second-color strings

## 4. Tests & polish

- [x] 4.1 `src/engine/fillpatterns.test.ts`: Bayer checkerboard/extremes/monotony/approximation quality, noise determinism and density, stripe/dot growth and exact 50% split, gradient profiles, region assignment
- [x] 4.2 `src/engine/floodfill.test.ts`: connected-region fill, diagonal non-leak, no-op identity, sub-cell resolution, `floodRegion` purity, hex edge adjacency
- [x] 4.3 README feature list note; `oxlint`, `tsc --noEmit`, `vitest run`, `vite build` green; manual smoke: Bayer 8×8 radial gradient between two colors

## 5. Expansion: more patterns, per-pattern settings, size presets

- [x] 5.1 `src/engine/fillpatterns.ts`: `bayer16`, `ign` (interleaved gradient noise), `checker`, `grid`, `hatch`, `zigzag`, `bricks`, `rings`; `PatternOpts` (scale / grain / seed) threaded through `patternAt` and `applyFillStyle`; `SCALED_PATTERNS` / `GRAIN_PATTERNS` sets
- [x] 5.2 `src/state/store.ts`: `FillStyle.scale` / `.grain` defaults; no wiring changes needed (style flows through)
- [x] 5.3 `src/components/FillSettings.tsx`: conditional Pattern-scale and Grain sliders; preview honors scale/grain/seed; `src/components/ToolRail.tsx`: settings panel scrolls (`max-h` + overflow)
- [x] 5.4 `src/engine/sizes.ts`: grouped aspect-ratio presets (1:1, 4:3, 3:2, 16:9, 21:9, 2:1, 10:9 Game Boy, 8:7 NES) with even+odd sibling per size, clamped to `MAX_SIZE`; `src/components/TopBar.tsx`: optgroup select with odd labels
- [x] 5.5 i18n EN/RU: new pattern names/descriptions, scale/grain sliders, `top.odd`
- [x] 5.6 Tests: `src/engine/sizes.test.ts` (bounds, parity, ratio tolerance, uniqueness); fillpatterns tests for the new patterns (extremes at every scale, monotony, grain blocks, ring anchor, IGN determinism, checker blocks, bayer16 accuracy chain)
- [x] 5.7 OpenSpec deltas updated (drawing-tools, canvas-grid); README; full verification green
