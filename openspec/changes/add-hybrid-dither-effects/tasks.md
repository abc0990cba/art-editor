# Tasks: add-hybrid-dither-effects

## 1. Engine

- [x] 1.1 `import-hybrid.ts`: band plan, per-band runs through the standard
      dispatcher, composite by luminance band, nesting guard
- [x] 1.2 `mapPosterizeJitter` in `import-adaptive.ts` (Bayer-boundary jitter)
- [x] 1.3 `import-duotone.ts`: luminance → two-ink projection pre-quantization
- [x] 1.4 `applyEdgeOutline` in `import-post.ts` (4-neighborhood luminance edges)
- [x] 1.5 `ImportOptions`: hybrid bands + splits, posterize levels, duotone pair,
      edge outline, ascii ramp; `convertImage` wiring; catalog rows + `hybrid` family

## 2. UI and presets

- [x] 2.1 `import-effects-section.component.tsx`: band selects (hybrid ids disabled),
      band splits, posterize bands, custom ramp field, duotone pair, outline slider
- [x] 2.2 Presets: tri-band, duotone-print, silk-poster; preset test derives valid
      dithers from the catalog
- [x] 2.3 i18n (EN/RU) for every new control and dither

## 3. Tests

- [x] 3.1 `import-effects.test.ts`: band equivalence vs direct conversions,
      determinism, nesting guard, posterize band count, duotone projection,
      edge inking, ramp override
- [x] 3.2 Full gate green
