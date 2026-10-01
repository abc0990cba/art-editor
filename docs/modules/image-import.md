# Image import — technical notes

## Scope

The photo→pixels pipeline: `src/engine/import-image.ts` (facade `convertImage`) plus ten
stage modules (`import-fit`, `import-quantize`, `import-ordered`, `import-diffusion`,
`import-special`, `import-glyph`, `import-post`, `import-palette`, `import-presets`,
`import-shared`). The import dialog UI (`src/features/import/`) is covered where it touches
the pipeline. The palette ecosystem itself: [palettes-and-presets](palettes-and-presets.md).

## Module map

| File | Role |
|---|---|
| `src/engine/import-image.ts` | `convertImage` facade, stage order, `colorRegions` |
| `src/engine/import-fit.ts` | placement (cover/contain/stretch/resize), `pixelScale`, preprocessing chain |
| `src/engine/import-quantize.ts` | median-cut palette (2..64), `expandPaletteWithBlend`, `normalizePalette` |
| `src/engine/import-ordered.ts` | 10 ordered dithers, two-color-axis math, strength semantics |
| `src/engine/import-diffusion.ts` | 9 error-diffusion kernels (FS…Nakano), serpentine scan |
| `src/engine/import-special.ts` | Ostromoukhov, variable-error, dot-diffusion, Riemersma |
| `src/engine/import-glyph.ts` | tone-glyph and palette-glyph mapping (`GlyphCtx`) |
| `src/engine/import-post.ts` | glow/denoise/smooth post chain + re-snap |
| `src/engine/import-palette.ts` | `curateImportPalette` — recolor/drop/transparent post-processing |
| `src/engine/import-presets.ts` | 10 one-click presets + preset JSON import |

## How it works

Stage order in `convertImage(src, opts, grid, currentPalette)`:
`resolveLayout → prepareSample → normalizePalette/medianCut → expandPaletteWithBlend? →
ditherSample → applyPostEffects? → expandCells` (each sample becomes a `pixelScale²` block,
`v+1`). The dialog decodes a `File` into an `ImportBitmap` (offscreen canvas) — the engine
pipeline is pure.

- **Placement**: cover (crop center), contain (letterbox with transparent margins), stretch,
  resize (the *canvas* resizes to the photo's proportions). `pixelScale` 1–4 replicates each
  sample into scale² cells. Sampling is alpha-weighted area-average into Float64 RGBA.
- **Preprocess** (in order): brightness/contrast/saturation → gaussian blur → unsharp sharpen
  → hue rotate → median denoise → pre-smooth → chromatic aberration. All from
  `image-ops.ts` (pure, deterministic).
- **Palette**: `current | preset | auto`; median-cut splits the widest-channel box at the
  median until *n* boxes (deterministic stride sampling, capped 32 768 samples), box averages
  sorted by luminance "so the document palette reads like a ramp". Blend expansion inserts
  1/2/3 midpoints per adjacent pair (cap 64) — "blended midpoints exist only for dither
  matching and the resulting artwork; they never feed back into auto-quantization".
- **Dithering (23 + none)**: *ordered* (10): Bayer 2–16, cluster-dot, halftone, blue-noise,
  void-cluster, pattern, crosshatch — each pixel projects onto the two nearest palette
  colors' axis and flips on `t > T − (0.5 − field)·strength`. *Diffusion* (9): Floyd–Steinberg,
  Atkinson, Sierra, Sierra-Lite, Stucki, Burkes, JJN, Stevenson–Arce, Nakano — canonical
  kernels, serpentine scan (`ltr = y % 2 === 0`), reused error scratch ("the hot path
  allocates nothing"). *Special* (4): Ostromoukhov (tone-varying weights, 32 luminance bands),
  variable-error (FS geometry, tone-sliding weights), dot-diffusion (4×4 class matrix),
  Riemersma (16-slot decaying error ring along scan order — serpentine here, *not* a Hilbert
  curve). Strength semantics differ per family: ordered = matrix influence; diffusion = error
  multiplier; glyph = mix probability via `cellHash`. Threshold slider (0–255, 128 neutral)
  applies to ordered only.
- **Glyph path**: tone glyphs replace the matrix with `glyphCellAt(set, x, y, t)`
  ([glyphs](glyphs.md)); palette glyphs rank palette colors by luminance into tile levels,
  off-tile cells stepping to the next luminance neighbor.
- **Post**: rebuild RGBA from snapped indices → glow screen-blend bloom → median denoise →
  blur → **re-snap every pixel to the palette** ("everything settles back into the palette").
  `curateImportPalette` recolors/drops/makes-transparent colors in place — no re-quantization.

Presets (`import-presets.ts`): gameboy, gameboy-pocket, macintosh, newspaper, halftone-print,
nes, zx-spectrum, cga-vaporwave, teletext, gruvbox — each a named option bundle (e.g.
zx-spectrum = floyd + blend 50, "color clash tamed by blending ramp steps").

## Invariants & constraints

- Alpha < 128 → empty; unknown strategies fall back to nearest-color mapping.
- The dialog guards square grids only — non-square documents get no conversion.
- `convertImage` runs on the **main thread**; the 60 ms `setTimeout` in the dialog is a
  courtesy delay so slider drags coalesce — not a worker (worker port is roadmap item P5 in
  `docs/research/performance.md` §9).

## Performance characteristics

Median-cut is sample-capped; diffusion passes are allocation-free in the hot loop. Whole
conversion blocks the main thread (hundreds of ms for large photos with post effects) —
bounded in practice by the preview size, flagged for a worker port (W1 pattern, proven in
trace/gradient workers).

## Testing

`import-image.test.ts`, `import-palette.test.ts`, `import-presets.test.ts`; glyph mapping in
`glyph-import.test.ts`.

## Related decisions

- [dither-and-patterns](dither-and-patterns.md) — shared matrices; `levels` differs per
  consumer by design.
- [ADR-0003](../decisions/0003-rust-wasm-policy.md) — why dithering stays TS.

## OpenSpec capabilities

- No main-spec capability yet; `openspec/changes/expand-dither-toolkit/` carries the
  `import-image` capability delta (the 63-effect expansion).

## Known limitations

- Main-thread conversion (P5 roadmap).
- `resize` placement mutates the canvas size (documented UX), not the photo.
