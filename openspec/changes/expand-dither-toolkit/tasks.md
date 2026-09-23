# Tasks: expand-dither-toolkit

## 1. Engine — shared matrices and dithering

- [x] 1.1 `src/engine/ditherMatrices.ts`: Bayer 2–16 recursive expansion, CLUSTER4, HALFTONE4,
      BLUE_NOISE8, VOID_CLUSTER8, PATTERN8, `thresholdAt`, `crosshatchAt`
- [x] 1.2 `src/engine/fillpatterns.ts`: consume the shared module (Bayer re-export, identical
      thresholds); add `cluster`, `halftone`, `blue-noise`, `void-cluster` patterns
- [x] 1.3 `src/engine/importImage.ts`: `ImportDither` grows to 23 algorithms; table-driven
      `DIFFUSION_KERNELS` (serpentine, mirrored dx), `mapOstromoukhov`, `mapVariableError`,
      `mapDotDiffusion`, `mapRiemersma`; ordered field generalized over threshold matrices;
      `ditherStrength` (0–100) and `threshold` (0–255) options
- [x] 1.4 `src/engine/imageOps.ts`: gaussianBlurRGBA (3× box), sharpenRGBA (unsharp),
      hueRotateRGBA, medianDenoiseRGBA, glowScreenRGBA (screen blend), chromaticAberrationRGBA
- [x] 1.5 `convertImage` pipeline: pre (blur → sharpen → hue → denoise → smooth) → aberration →
      palette (+ blend) → dither → glow → post denoise/smooth → palette re-snap → cells

## 2. Engine — palettes and presets

- [x] 2.1 `src/engine/palettes.ts`: + B&W, Game Boy Pocket, NES, ZX Spectrum, CGA Mode 4,
      Macintosh, Teletext, Gruvbox
- [x] 2.2 `src/engine/importImage.ts`: `expandPaletteWithBlend` (luminance-adjacent midpoints,
      64-color cap)
- [x] 2.3 `src/engine/paletteIO.ts`: `parsePaletteText` (hex/gpl/loose), `parseGpl`,
      `serializeHex`, `serializeGpl`
- [x] 2.4 `src/engine/importPresets.ts`: ten built-in import presets as full ImportOptions
      snapshots with palette sync
- [x] 2.5 `src/engine/presets.ts`: built-in editor presets Teletext, CGA Terminal,
      Macintosh Classic, Gruvbox Study

## 3. State and UI

- [x] 3.1 `src/state/store.ts`: `replacePalette` action
- [x] 3.2 `src/components/paletteFiles.ts`: DOM glue — palette image sampling (median cut),
      PNG strip blob, text/image file reading
- [x] 3.3 `src/components/ImportDialog.tsx`: preset chip row, grouped dither select
      (off/ordered/diffusion/special), strength/threshold sliders, pre/post collapsible
      sections, palette-blend slider
- [x] 3.4 `src/components/SettingsPanel.tsx`: palette import/export chips in the Color section
- [x] 3.5 `src/i18n/en.ts` + `ru.ts`: dither names/descriptions, sliders, import presets,
      palettes, fill patterns, new preset names

## 4. Tests and polish

- [x] 4.1 `src/engine/ditherMatrices.test.ts`: shapes, level ranges, thresholdAt tiling/range,
      crosshatch bounds and known extremes
- [x] 4.2 `src/engine/imageOps.test.ts`: blur solid/impulse, sharpen contrast, hue rotation,
      denoise speck removal, glow brightening and range, aberration channel shifts
- [x] 4.3 `src/engine/importImage.test.ts`: strength 0 ≡ nearest for all diffusion kernels,
      determinism + palette bounds for all 23 algorithms, threshold bias direction,
      ordered strength 0 collapse, blend midpoints/cap, glow spread, post pipeline
- [x] 4.4 `src/engine/fillpatterns.test.ts`: extremes/monotony and tiling for the new patterns
- [x] 4.5 `src/engine/paletteIO.test.ts`: hex/gpl parsing, junk rejection, round-trips
- [x] 4.6 `src/engine/importPresets.test.ts`: unique ids, option ranges, palette references
- [x] 4.7 `oxlint`, `tsc --noEmit`, `vitest run`, `vite build` green; README feature list
