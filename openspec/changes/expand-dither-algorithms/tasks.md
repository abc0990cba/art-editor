# Tasks: expand-dither-algorithms

## 1. Ordered

- [x] 1.1 `BAYER32`, screen-rank builder + rosette/elliptical/Euclidean 8×8,
      pattern-rank builder + weave/twill/houndstooth 8×8 (`dither-matrices.ts`)
- [x] 1.2 `dither-fields.ts`: lines-h/v/diag, IGN, spiral, rings, sunburst,
      phyllotaxis, zigzag, fractal-noise
- [x] 1.3 `dither-blue-noise.ts`: toroidal farthest-point 16×16 mask, memoized
- [x] 1.4 `ORDERED_FIELDS` + `orderedFieldFor(id, glyphSet)` custom-matrix bridge
- [x] 1.5 Glyph-set picker shows for custom-matrix in the import dialog

## 2. Diffusion and paths

- [x] 2.1 Kernels: sierra-2, diffusion-1d, spread-h, spread-v (`import-diffusion.ts`)
- [x] 2.2 `diffusion-scans.ts`: column / diagonal / spiral / Hilbert / random orders
- [x] 2.3 `import-path.ts`: `mapPathDiffusion` + `PATH_DIFFUSIONS` dispatch

## 3. Special

- [x] 3.1 Yliluoma palette-mix search (`mapYliluoma`)
- [x] 3.2 Noise-threshold and edge-aware FS variants (`fsCore`)

## 4. Catalog, i18n, tests

- [x] 4.1 31 new catalog rows + `path` family
- [x] 4.2 i18n keys (EN + RU): 31 names + descriptions + `import.ditherGroup.path`
- [x] 4.3 `dither-catalog.test.ts`: catalog closure, matrix/field invariants, scan
      order permutations, per-algorithm determinism / palette bounds / transparency /
      strength-0 ≡ nearest / threshold direction
- [x] 4.4 Full gate green
