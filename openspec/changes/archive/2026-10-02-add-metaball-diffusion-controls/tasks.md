# Tasks: add-metaball-diffusion-controls

## 1. Engine

- [x] 1.1 `metaball-field.ts` (new): `MetaballFalloff`, `MetaballSource`, `MetaballCapsule`,
      `MetaballField`, `kernelRadius`, `falloffPower`, `metaballIso`, `buildMetaballField`
      (splats + capsules + border/mirror + quality/step), `loopsToSmoothPath`
- [x] 1.2 `doc.ts`: `metaball.iso` (default 0.5) + `metaball.falloff` (default `smooth`) in
      `MetaballSettings` + `defaultMetaball`
- [x] 1.3 `geometry-metaball.ts`: rebuild on `buildMetaballField` (square adapter: buffer scan +
      junction sources + link capsules in doc units); trace at `metaballIso(doc)`; drop local
      field code and `ISO`
- [x] 1.4 `grid-geometry.ts`: `gridMetaball` on `buildMetaballField` (centers as sources, links
      filtered by group value); delete `loopsToDocPath`
- [x] 1.5 `project-parse.ts` + `presets.ts`: tolerant load + preset clamp for `iso`/`falloff`
- [x] 1.6 `doc-style.ts` + `geometry-elements.ts`: enumerate `iso`/`falloff` in style equality
      and element style key

## 2. Overlays

- [x] 2.1 `ui.slice.ts`: `showDiffusionGuides` (default false) + setter
- [x] 2.2 `stage-themes.ts`: `fieldContour` color per theme
- [x] 2.3 `canvas-stage.component.tsx`: threshold-contour overlay (memoized field + marching
      squares + dashed stroke), half-cell `Path2D` in the square grid-line memo, kernel ring in
      the hover pass; gates on metaball mode + toggle

## 3. UI & i18n

- [x] 3.1 `style-section.component.tsx`: threshold slider, falloff chips, quality `ultra` chip
- [x] 3.2 `canvas-section.component.tsx`: "Diffusion guides" CheckRow (metaball mode only)
- [x] 3.3 i18n `en.messages.ts` + `ru.messages.ts`: `metaball.iso`, `metaball.falloff.*`,
      `metaball.quality.ultra`, `canvas.diffusion`

## 4. Persistence

- [x] 4.1 `ui.slice.ts`: persist `showGrid`, `gridEmphasis`, `showDiffusionGuides`

## 5. Tests & polish

- [x] 5.1 `metaball-field.test.ts`: falloff ordering, iso clamp, squareEdges mirror, capsule
      value filtering
- [x] 5.2 geometry tests: iso lowers → blob grows; square/hex parity; round trip with
      `iso`/`falloff`; preset clamps; element restyle invalidation
- [ ] 5.3 Browser smoke (metaball + guides, both grid families, export cleanliness, reload
      persistence); `format:check`/`lint`/`arch:check`/`knip`/`tsc`/`test` green
