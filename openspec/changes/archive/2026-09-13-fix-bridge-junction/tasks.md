# Tasks: fix-bridge-junction

## 1. Engine

- [x] 1.1 `outline.ts`: bridgeOverlays → junction-aligned diamond with concave-radius fillets
      (drop `roundedSquare`)

## 2. UI

- [x] 2.1 `SettingsPanel`: per-corner controls gated to square grid + pixels mode

## 3. Tests & polish

- [x] 3.1 Update bridge assertions; add diagonal-direction symmetry test
- [x] 3.2 Browser smoke (diagonal pair, L-shape, Corner + Bridge); lint/tsc/vitest/build; archive
