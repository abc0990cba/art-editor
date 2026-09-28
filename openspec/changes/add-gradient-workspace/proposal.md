# Proposal: add-gradient-workspace

## Why

The app already traces raster into flat-color SVG paths (vector workspace), but smooth raster
color transitions — gradients, shading, soft highlights — collapse into banded flat layers. The
goal: a third project kind whose workspace converts raster gradients into **native SVG gradient
paints** (`linearGradient`/`radialGradient` with stops, plus stacked soft "spot" layers), keeping
the output AI-safe — only the SVG subset Adobe Illustrator imports reliably (no blend modes).

## What Changes

- **Engine** (`src/engine/gradient/`): per-region parametric gradient fitting (solid → linear →
  radial via affine regression / structure tensor / Sobel-normal center solve), 1-D stop reduction
  (binned medians → RDP by ΔE2000 → exact stop colors via Thomas algorithm), a quadratic
  smoothness gate, greedy residual "spot" layers (AI-safe Gaussian-splat equivalent), a full
  raster→SVG pipeline reusing the trace engine's clustering and outline stages, and a downsampled
  ΔE error map.
- **Third project kind** `kind: 'gradient'`: storage union + upgrade-on-read branch (no IDB
  migration needed — records are self-sufficient), its own zustand slice (mirroring the vector
  slice, throttled autosave into the bound entry), a gradient worker + hook, a workspace with
  result / original / ΔE-heatmap preview, a params panel (presets, fit mode, tolerance, stop and
  layer budgets) and SVG export/copy.
- **App chrome** follows the kind: route surface, top-bar branches, creation dialog card, library
  card badge and thumbnail, i18n (en/ru).
- **AI-compat spike artifacts**: `samples/ai-import-test.svg` + `docs/ai-import-test.md` — a
  manual checklist defining the AI-safe export profile (stage 0 of the roadmap).

## Impact

- Affected specs: `project-library` (third kind), new capability `gradient-trace`.
- No IDB version bump; upgrade-on-read handles the new kind.
- Engine stays pure (dependency-cruiser rules untouched); the feature never imports other
  features.

## Out of scope (later stages of the roadmap)

- Manual gradient handles on canvas, per-layer refit ("refit the rest").
- Browser render-oracle quality gate (currently the math renderer scores error maps).
- Mesh / diffusion-curve models (not AI-safe via SVG; need a WebGL renderer).
