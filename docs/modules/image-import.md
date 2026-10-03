# Image import — technical notes

## Scope

The photo→pixels pipeline in [`src/engine/import/`](../../src/engine/import/index.ts): a pure
`convertImage` facade plus stage modules for fit sampling, pre-filters, palette quantization,
the dither dispatch and post effects. The import dialog UI ([`src/features/import/import-dialog.component.tsx`](../../src/features/import/import-dialog.component.tsx)
and siblings) decodes a `File` into an `ImportBitmap` (offscreen canvas) and feeds it to the
engine; the engine side has no DOM APIs. The palette ecosystem itself:
[palettes-and-presets](palettes-and-presets.md).

## Module map

| File | Role |
|---|---|
| [`src/engine/import/index.ts`](../../src/engine/import/index.ts) | `convertImage` facade, `ditherSample`/`runDither` family dispatch, `colorRegions`, `ImportOptions` |
| [`src/engine/import/fit.ts`](../../src/engine/import/fit.ts) | `resolveLayout`, `prepareSample` (placement + pre-filter chain), `resizeTargetSize` |
| [`src/engine/import/shared.ts`](../../src/engine/import/shared.ts) | `clamp255`, `luminanceOf`, `PaletteRgb` channel layout, `nearestIndex`, `mapNearest` |
| [`src/engine/import/quantize.ts`](../../src/engine/import/quantize.ts) | `normalizePalette`, `medianCut`, `expandPaletteWithBlend` |
| [`src/engine/import/ordered.ts`](../../src/engine/import/ordered.ts) | `ORDERED_FIELDS`, `orderedFieldFor`, `mapOrdered` — two-color-axis threshold math |
| [`src/engine/import/diffusion.ts`](../../src/engine/import/diffusion.ts) | `DIFFUSION_KERNELS` (canonical tables), `mapErrorDiffusion` (serpentine) |
| [`src/engine/import/path.ts`](../../src/engine/import/path.ts) | `mapPathDiffusion` — decaying 16-slot error memory along a visit order, `pathOrderFor` |
| [`src/engine/import/adaptive.ts`](../../src/engine/import/adaptive.ts) | FS variants: `mapNoiseThreshold`, `mapEdgeAware` (shared `fsCore`), `mapPosterizeJitter` |
| [`src/engine/import/special.ts`](../../src/engine/import/special.ts) | `SPECIAL_MAPPERS` registry: Ostromoukhov, variable-error, dot-diffusion, Riemersma |
| [`src/engine/import/cmyk.ts`](../../src/engine/import/cmyk.ts) | `mapCmyk` — C15/M75/Y0/K45 rosette plates, subtractive overprint |
| [`src/engine/import/yliluoma.ts`](../../src/engine/import/yliluoma.ts) | `mapYliluoma` — palette-mix search over luminance-bracketing pairs |
| [`src/engine/import/duotone.ts`](../../src/engine/import/duotone.ts) | `mapDuotone` — gradient-map pre-pass before quantization |
| [`src/engine/import/hybrid.ts`](../../src/engine/import/hybrid.ts) | `mapHybrid`, `bandOf` — three whole-image runs composited by tone band |
| [`src/engine/import/glyph.ts`](../../src/engine/import/glyph.ts) | `GLYPH_MAPPERS` — tone glyphs (`mapGlyphTone`) and palette glyphs (`mapGlyphPalette`) |
| [`src/engine/import/post.ts`](../../src/engine/import/post.ts) | `applyPostEffects` (glow/denoise/smooth + re-snap), `applyEdgeOutline` |
| [`src/engine/import/palette.ts`](../../src/engine/import/palette.ts) | `curateImportPalette` — recolor/drop/transparent editing of a conversion result |
| [`src/engine/import/presets.ts`](../../src/engine/import/presets.ts) | `IMPORT_PRESETS` — 13 one-click option bundles |
| [`src/engine/import/ops.ts`](../../src/engine/import/ops.ts) | raster ops over straight RGBA `Float64Array`: blur, sharpen, hue, median denoise, glow, aberration |

Shared algorithm data lives one layer over: the dither id union + family catalog
([`src/engine/dither/catalog.ts`](../../src/engine/dither/catalog.ts)), threshold
matrices/fields ([`src/engine/dither/matrices.ts`](../../src/engine/dither/matrices.ts),
[`src/engine/dither/fields.ts`](../../src/engine/dither/fields.ts),
[`src/engine/dither/blue-noise.ts`](../../src/engine/dither/blue-noise.ts)) and scan paths
([`src/engine/dither/scans.ts`](../../src/engine/dither/scans.ts)). Glyph tile sets come from
the [glyph domain](glyphs.md) ([`src/engine/glyph/tiles.ts`](../../src/engine/glyph/tiles.ts),
[`src/engine/glyph/text-raster.ts`](../../src/engine/glyph/text-raster.ts)).

## How it works

`convertImage(src, opts, grid, currentPalette)` in [`src/engine/import/index.ts`](../../src/engine/import/index.ts),
stage by stage:

1. **Layout** — `resolveLayout` (fit.ts). `'resize'` re-derives the canvas size from the photo
   proportions via `resizeTargetSize` (clamped to `MIN_SIZE`/`MAX_SIZE` from `core/doc`);
   otherwise the grid stands. Output: cell buffer `bw × bh` (`cols·sub × rows·sub`) and the
   sample grid `tw × th` (`ceil(bw/scale)`, pixel scale clamped 1..4).
2. **Sampling + pre-filters** — `prepareSample` (fit.ts): `fitToGrid` downsamples into the
   sample grid — `cover` center-crops the source, `contain` letterboxes with transparent
   margins, `stretch`/`resize` map 1:1; colors accumulate alpha-weighted box averages into
   straight RGBA `Float64Array`. Then in order: `adjustImage` (brightness/contrast/saturation)
   → `gaussianBlurRGBA` → `sharpenRGBA` → `hueRotateRGBA` → `medianDenoiseRGBA` (pre-denoise)
   → blur (pre-smooth) → `chromaticAberrationRGBA`. Every op lives in
   [`src/engine/import/ops.ts`](../../src/engine/import/ops.ts) — pure and deterministic.
3. **Duotone pre-pass** — if `opts.duotone` is set, `mapDuotone` (duotone.ts) projects each
   pixel's luminance onto the dark→light pair *before* quantization, so any algorithm then
   dithers a two-tone map.
4. **Palette** — `normalizePalette` over the choice: `current` (the document palette),
   `preset` (a fixed color list), or `auto` → `medianCut` (median split of the widest-channel
   box until *n* boxes; deterministic stride sampling, capped 32 768 samples; box averages
   sorted by luminance "so the document palette reads like a ramp"). With `blend > 0`,
   `expandPaletteWithBlend` inserts 1/2/3 midpoints per adjacent luminance-sorted pair
   (palette capped at 64) — "blended midpoints exist only for dither matching and the
   resulting artwork; they never feed back into auto-quantization". `paletteChannels`
   (shared.ts) flattens the hex list into parallel RGB arrays for the hot loop.
5. **Dithering** — `ditherSample` → `runDither`, which switches on
   `DITHER_CATALOG[id].family` and fills an `Int32Array` of palette indices (−1 = empty):
   - `off` → `mapNearest` (shared.ts). Unknown ids also fall back to nearest.
   - `ordered` (31 ids) → `orderedFieldFor` resolves the threshold field — Bayer 2–32,
     print screens, line screens, IGN, blue noise, procedural fields, or `custom-matrix`
     which projects the user's tile set through `glyphSetToField` — then `mapOrdered`
     (ordered.ts): each pixel projects onto the two nearest palette colors' axis and flips on
     `t > T − (0.5 − field)·strength`.
   - `diffusion` (13 ids) → `DIFFUSION_KERNELS[id]` + `mapErrorDiffusion` (diffusion.ts):
     canonical kernels (Floyd–Steinberg, Atkinson, Sierra family, Stucki, Burkes, JJN,
     Stevenson–Arce, Nakano, 1-D, anisotropic spreads), serpentine scan (`ltr = y % 2 === 0`),
     reused error scratch — the hot path allocates nothing.
   - `path` (5 ids) → `pathOrderFor` builds the visit order (`scanOrder` from
     [`src/engine/dither/scans.ts`](../../src/engine/dither/scans.ts): column serpentine,
     anti-diagonals, spiral, Hilbert, seeded random) and `mapPathDiffusion` (path.ts) walks it
     with a decaying 16-slot error memory (Riemersma's model, no neighbor spread).
   - `glyph` (4 ids) → `GLYPH_MAPPERS[id]` (glyph.ts): tone glyphs pick between the two
     palette colors bracketing the pixel tone via `glyphCellAt`; palette glyphs rank the
     palette by luminance into tile levels. The tile set is `opts.glyphSet`, or for `ascii` a
     custom ramp through `asciiGlyphSet`, else `builtinDitherSets()[id]` from
     [`src/engine/glyph/text-raster.ts`](../../src/engine/glyph/text-raster.ts).
   - `special` (9 ids) → `posterize` dispatches to `mapPosterizeJitter` (adaptive.ts); the
     rest through `SPECIAL_MAPPERS` (special.ts): Ostromoukhov (tone-varying weights, 32
     luminance bands), variable-error (FS geometry, tone-sliding weights), dot-diffusion
     (4×4 class matrix), Riemersma, noise-threshold + edge-aware (adaptive.ts, shared
     `fsCore`), Yliluoma (yliluoma.ts), CMYK rosette separation (cmyk.ts).
   - `hybrid` → `mapHybrid` (hybrid.ts): a `HybridPlan` (`hybridLow`/`Mid`/`High` + band
     split points) runs each band's algorithm as an ordinary whole-image pass via a `run`
     callback that re-enters `runDither` — the composite reads each pixel from the run whose
     tone band owns it. `plainBandId` degrades nested hybrid to `none` (no recursion).

   Strength semantics differ per family: ordered = matrix influence (the threshold slider,
   0–255 with 128 neutral, applies to ordered only); diffusion = error multiplier; glyph =
   mix probability via the deterministic `cellHash` position hash.
6. **Post** — when glow/denoise/smooth/edge-outline are active, `applyPostEffects` (post.ts)
   rebuilds RGBA from the snapped indices, applies the screen-blend glow
   (`glowScreenRGBA`), median denoise, blur — and **re-snaps every pixel to the palette**
   ("everything settles back into the palette"). `applyEdgeOutline` then stamps the darkest
   palette ink onto luminance edges of the dithered result (4-neighborhood, amount sweeps the
   threshold).
7. **Expansion** — `expandCells`/`stampCell` (index.ts) replicate each sample index into its
   `scale²` cell block (`v + 1`; 0 stays empty/transparent) and the result
   (`ImportResult { cols, rows, palette, cells }`) is committed by the caller as one undoable
   step.

`colorRegions` (index.ts) is a separate export: 4-connected same-value regions of a converted
buffer, grouped by palette value — it feeds the "object per connected region" import split so
each color island lands as its own movable object. The dialog pipeline ends with
`curateImportPalette` (palette.ts): recolor kept colors in place, drop colors (their cells go
to the nearest kept color), mark one color transparent (its cells empty) — cell remapping,
never re-quantization.

Presets ([`src/engine/import/presets.ts`](../../src/engine/import/presets.ts)): gameboy,
gameboy-pocket, macintosh, newspaper, halftone-print, nes, zx-spectrum, cga-vaporwave,
teletext, gruvbox, tri-band, duotone-print, silk-poster — each a named `ImportOptions`
snapshot (e.g. zx-spectrum = floyd + blend 50, "color clash tamed by blending ramp steps";
tri-band = `hybrid` with `lines-diag`/`floyd`/`halftone` bands).

## Invariants & constraints

- Alpha < 128 → empty; unknown dither ids fall back to nearest-color mapping.
- The dialog guards square grids only — non-square documents get no conversion.
- `convertImage` runs on the **main thread**; the `setTimeout` in
  [`src/features/import/import-dialog.component.tsx`](../../src/features/import/import-dialog.component.tsx)
  is a courtesy delay so slider drags coalesce — not a worker (worker port is roadmap item P5
  in `docs/research/performance.md` §9).
- The blend-expanded palette is what the document stores; auto-quantization itself never sees
  the midpoints.
- `curateImportPalette` is defined on `ImportResult` and stays pure — the dialog derives the
  curated view in a `useMemo` instead of mutating the conversion.

## Performance characteristics

Median-cut is sample-capped; diffusion passes are allocation-free in the hot loop. Whole
conversion blocks the main thread (hundreds of ms for large photos with post effects) —
bounded in practice by the preview size, flagged for a worker port (W1 pattern, proven in the
trace/gradient workers — [vectorizer](vectorizer.md),
[gradient-workspace](gradient-workspace.md)). Cost baselines for individual algorithms live in
[`src/engine/dither/dither.bench.ts`](../../src/engine/dither/dither.bench.ts) +
`bench/PERFLOG.md` (2026-10-02 row).

## Testing

- [`src/engine/import/import-image.test.ts`](../../src/engine/import/import-image.test.ts) —
  layout, median cut, blend expansion, end-to-end `convertImage`.
- [`src/engine/import/effects.test.ts`](../../src/engine/import/effects.test.ts) — post
  effects and combo behaviors through the facade.
- [`src/engine/import/palette.test.ts`](../../src/engine/import/palette.test.ts) —
  `curateImportPalette` remapping.
- [`src/engine/import/presets.test.ts`](../../src/engine/import/presets.test.ts) — every
  preset id valid against `DITHER_CATALOG`, params in range.
- [`src/engine/import/ops.test.ts`](../../src/engine/import/ops.test.ts) — raster ops.
- Glyph dither behavior through `convertImage`:
  [`src/engine/glyph/import.test.ts`](../../src/engine/glyph/import.test.ts).

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

## Dither catalog expansion (2026-10)

The algorithm library grew to 64 catalog ids (63 algorithms + `none`) behind a declarative
catalog ([`src/engine/dither/catalog.ts`](../../src/engine/dither/catalog.ts)): every id
declares its strategy family (off / ordered / diffusion / path / hybrid / special / glyph) and
the switches it enables (threshold slider, glyph picker). The pipeline dispatch
(`runDither`), the dialog groups and both visual galleries all derive from the catalog — a new
algorithm is one union member + one catalog row + its implementation entry + i18n, never a UI
edit.

- **Ordered**: Bayer 32; rosette / elliptical / Euclidean print screens (rank-by-spot);
  line screens h/v/diag; IGN; generated 16×16 blue noise; spiral, rings, sunburst,
  phyllotaxis, zigzag, fractal-noise fields; weave / twill / houndstooth ranks;
  `custom-matrix` (the user's glyph tile set as the threshold field via `glyphSetToField`).
- **Diffusion**: Sierra-2, 1D horizontal, anisotropic h/v spread.
- **Scan paths** (decaying 16-slot error memory along a path —
  [`src/engine/import/path.ts`](../../src/engine/import/path.ts)): column serpentine,
  anti-diagonals, spiral, Hilbert (true Riemersma), seeded random —
  [`src/engine/dither/scans.ts`](../../src/engine/dither/scans.ts) builds visit-order
  permutations, `mapPathDiffusion` walks them.
- **Special**: Yliluoma palette-mix search ([`src/engine/import/yliluoma.ts`](../../src/engine/import/yliluoma.ts)),
  noise-threshold and edge-aware FS variants ([`src/engine/import/adaptive.ts`](../../src/engine/import/adaptive.ts),
  shared `fsCore`), CMYK rosette separation ([`src/engine/import/cmyk.ts`](../../src/engine/import/cmyk.ts),
  C15/M75/Y0/K45 plates overprinted subtractively).
- **Hybrid bands** ([`src/engine/import/hybrid.ts`](../../src/engine/import/hybrid.ts)): three
  registered algorithms (any family) run as ordinary whole-image passes; the composite reads
  each pixel from its luminance band. Hybrid as a band id degrades to nearest (no recursion).
- **Combos**: gradient-map duotone (pre-quantization), edge outline (post-dither inked edges,
  4-neighborhood), posterize with Bayer-boundary jitter, custom ASCII ramp for the `ascii`
  dither; `ascii`/`braille` glyph dithers use built-in tile sets from
  [`src/engine/glyph/text-raster.ts`](../../src/engine/glyph/text-raster.ts) (5×7 bitmap font;
  all 256 eight-dot braille patterns as a 2×4 ramp).
- Conformance (all ids, [`src/engine/dither/catalog.test.ts`](../../src/engine/dither/catalog.test.ts)):
  determinism, palette bounds, transparency survival, strength-0 ≡ nearest for
  diffusion/path/special/glyph, threshold-bias direction for every ordered id; cost baseline
  in [`src/engine/dither/dither.bench.ts`](../../src/engine/dither/dither.bench.ts) +
  `bench/PERFLOG.md` (2026-10-02 row).
