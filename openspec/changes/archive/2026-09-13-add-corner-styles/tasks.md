# Tasks: add-corner-styles

## 1. Engine

- [x] 1.1 `doc.ts`: `PixelStyle.convexRadius/concaveRadius/cornerStyle` with defaults
- [x] 1.2 `geometry.ts`: chamfer variant of `roundedRectPath`
- [x] 1.3 `outline.ts`: convex/concave radii (majority-turn convexity), chamfer fillets
- [x] 1.4 `project.ts`: serialize/validate the new style fields

## 2. UI

- [x] 2.1 `SettingsPanel`: outline convex/concave sliders; Arc/Chamfer chips (pixels + outline)
- [x] 2.2 `i18n`: new labels EN/RU

## 3. Tests & polish

- [x] 3.1 Unit tests: chamfer diamond, chamfer outline, convex-only L, rotation invariance
      (3 directions × outline/metaball), short-edge clamping
- [x] 3.2 Browser smoke of corner styles in both themes; lint/tsc/vitest/build; archive
