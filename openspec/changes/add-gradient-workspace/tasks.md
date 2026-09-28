# Tasks: add-gradient-workspace

## 1. Engine (src/engine/gradient/)

- [x] 1.1 Core fitting: types, color (Lab/ΔE2000), linalg, profile/stops, linear/radial fits,
      model selection, math renderer, AI-safe SVG compose (45 tests on synthetic fields)
- [x] 1.2 `params.ts`: GradientParams, normalize, built-in presets (art / flat / photo)
- [x] 1.3 `segment.ts`: cluster labels → region samples + outline paths (reuse trace engine)
- [x] 1.4 `layers.ts`: greedy residual spot layers with alpha-ramp stops (Gaussian-splat
      equivalent, source-over / AI-safe)
- [x] 1.5 `pipeline.ts`: raster → clustered regions → fits (+layers) → SVG + stats + ΔE demap

## 2. Storage and state

- [x] 2.1 `projects.ts`: `kind: 'gradient'` union member, upgrade-on-read branch, `newGradientEntry`
- [x] 2.2 `state/gradient.slice.ts`: workspace slice with throttled autosave into the bound entry
- [x] 2.3 Store composition and `State` surface

## 3. App chrome

- [x] 3.1 Route surface: `GradientSurface` in `project-route`, imports/pastes route by kind
- [x] 3.2 Top bar: pixel-only controls hidden for media kinds, name-scope dialogs
- [x] 3.3 New-project dialog: third kind card + minimal creation flow
- [x] 3.4 Library card: gradient badge + live SVG thumbnail
- [x] 3.5 i18n keys (en + ru)

## 4. Feature workspace (src/features/gradient/)

- [x] 4.1 `gradient.worker.ts` + `use-gradient-trace.hook.ts` (debounce, stale-drop, transferables)
- [x] 4.2 Preview: result / original / ΔE heatmap views
- [x] 4.3 Params panel: presets, mode, tolerance, stops, smoothness, cluster bits, min region, layers
- [x] 4.4 Workspace shell: toolbar, stats line, export/copy, mobile drawer

## 5. AI compatibility (stage-0 spike)

- [x] 5.1 `samples/ai-import-test.svg`: 9-section feature matrix
- [x] 5.2 `docs/ai-import-test.md`: manual checklist to fill in Illustrator

## 6. Deferred (follow-up changes)

- [ ] 6.1 Manual gradient handles on canvas; per-layer refit with pinned params
- [ ] 6.2 Browser render-oracle gate (serialize → draw → compare) as the acceptance metric
- [ ] 6.3 Mesh / diffusion-curve models with WebGL renderer + tessellated export
