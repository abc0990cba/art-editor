# Tasks: add-cell-form-jitter

## 1. Engine

- [x] 1.1 `doc.ts`: `PixelStyle.sizeJitter` / `angleJitter` / `jitterSeed` + defaults
- [x] 1.2 `jitter.ts` (new): seeded smooth per-cell `jitterAt` (size + angle factors)
- [x] 1.3 `geometry-shape.ts`: apply factors in `pushCell`; run-merge gate
- [x] 1.4 `grid-geometry.ts`: apply factors in `gridPixels`
- [x] 1.5 `project-parse.ts` + `presets.ts`: clamps; `doc-style.ts` + `geometry-elements.ts`: identity

## 2. UI & i18n

- [x] 2.1 `style-section.component.tsx`: two sliders + seed row (Randomize)
- [x] 2.2 i18n en + ru: `style.sizeJitter`, `style.angleJitter`, `style.jitterSeed`, randomize

## 3. Tests & polish

- [x] 3.1 `jitter.test.ts`: determinism, golden zero-jitter paths, area monotonicity, run-merge gate, parity
- [x] 3.2 Round trip + preset clamps + element restyle; browser smoke; full check loop green
