# Tasks: add-pixel-variety-pack

## 1. Engine

- [x] 1.1 `core/stroke.ts`: `StrokeSettings`, normalize, equality; `PixelStyle.stroke`
- [x] 1.2 `geometry/shape.ts` + `grids/geometry.ts`: stroke attributes in the per-color
      emission; staged preview parity
- [x] 1.3 `cell-shapes/ext.ts` + `geom.ts` + `frag.ts`: quadrant, bowtie, hourglass, keyhole,
      eye, parallelogram, waveStrip (registry + hit + frag)

## 2. UI, i18n, nodes, presets

- [x] 2.1 Stroke group in `style-section` (width, color mode, depth, fill toggle)
- [x] 2.2 i18n `style.stroke.*` + `cellform.<7 new ids>` en + ru
- [x] 2.3 `styles.node.ts` stroke params
- [x] 2.4 Preset rows (Blueprint, Contour Dots, Waveband, Keyholes, Eyes, Bowties)

## 3. Tests & checks

- [x] 3.1 Stroke emission tests (attributes, zero-width byte-compat); new-form registry tests
      pass (auto-iterated); round-trip clamps
- [x] 3.2 Full chain green (1360 tests, 0 lint errors, arch/knip/tsc clean); timing-ratchet
      flakiness under parallel workers documented in the session report
