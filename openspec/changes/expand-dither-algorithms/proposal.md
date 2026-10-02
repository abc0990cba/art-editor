# Proposal: expand-dither-algorithms

## Why

The 24-algorithm import library (see `expand-dither-toolkit`) still trails reference
tools (Dither Boy: 63 algorithms) and misses whole effect flavors: real print screens
(rosette/elliptical/Euclidean), line screens, procedural tone fields (spiral, rings,
sunburst, phyllotaxis, fractal noise), scan-path diffusion (Hilbert/Riemersma, spiral,
random), palette-aware mixing search (Yliluoma), and adaptive diffusion (edge-aware,
noise-jittered). Rival tools also let users bring their own threshold patterns — here the
glyph tile editor already exists but is not wired into ordered dithering.

## What Changes

- **19 new ordered dithers**: Bayer 32; rosette / elliptical / Euclidean 8×8 print
  screens (rank-by-spot-function construction); horizontal, vertical and diagonal line
  screens; IGN; a generated 16×16 blue-noise mask (toroidal farthest-point ranking);
  spiral, rings, sunburst, phyllotaxis, zigzag and fractal-noise procedural fields;
  basket-weave, twill and houndstooth pattern ranks; **custom-matrix** — the user's
  glyph tile set projected into the threshold field (Bayer 4 fallback).
- **4 new diffusion kernels**: Sierra-2, 1D horizontal diffusion, horizontally and
  vertically anisotropic spread.
- **New path-diffusion family** (decaying error memory along a scan path — the
  Riemersma model generalized): column serpentine, anti-diagonal sweeps, rectangular
  spiral, Hilbert curve (true Riemersma), seeded-random order.
- **3 new special strategies**: Yliluoma palette-mix search (best matching mix among
  luminance-bracketing palette colors and their 1/3–2/3 blends, blends rendered by a
  Bayer-ordered per-cell pick), noise-threshold (FS with deterministic noise jitter),
  edge-aware (FS whose diffusion fades on busy areas).
- **New engine modules**: `dither-fields.ts` (procedural fields), `dither-blue-noise.ts`
  (generated masks), `diffusion-scans.ts` (scan-order permutations),
  `import-path.ts` (path diffusion), `orderedFieldFor` bridge for custom matrices.
- The import dialog groups gain the "Scan paths" group; the glyph-set picker also shows
  for custom-matrix; all strings ship in EN and RU; the catalog registry (see
  `add-dither-registry`) keeps the touchpoints at catalog row + implementation + i18n.

## Capabilities

### Modified

- `import-image`: the dither algorithm library grows from 24 to 55 entries and gains
  the path-diffusion family and the user-defined threshold matrix.

## Non-Goals

- Video/animation/temporal effects, batch processing (unchanged).
- Vector halftone screen marks, stippling and multi-ink screens (next change).
- Text/ASCII/braille glyph rendering (next change).
