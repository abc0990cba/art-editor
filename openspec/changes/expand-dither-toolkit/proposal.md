# Proposal: expand-dither-toolkit

## Why

The image-import pipeline offered only six dither modes (Bayer 2/4/8, Floyd–Steinberg,
Atkinson, off) against tools like Dither Boy (63 effects) and Dither Guy (21 algorithms),
no control over dither strength, no pre/post processing, 15 palettes with no blend or
file import/export, and no import presets. Photos converted in rival tools kept more
algorithmic range and repeatability than this editor could match.

## What Changes

- **Shared dither-matrix module**: `src/engine/ditherMatrices.ts` centralizes every
  ordered threshold matrix — Bayer 2–16 (recursive expansion), clustered-dot 4×4,
  halftone 4×4, blue-noise 8×8, void-and-cluster 8×8, diagonal pattern 8×8, and the
  procedural crosshatch field — read through one `thresholdAt` convention. The fill
  pattern library now consumes it too (behavior unchanged for existing patterns).
- **Import dithering: 23 algorithms in three groups** — ordered (Bayer 2×2/4×4/8×8/16×16,
  cluster-dot, halftone, blue-noise, void-and-cluster, pattern, crosshatch), error
  diffusion (Floyd–Steinberg, Atkinson, Sierra, Sierra-Lite, Stucki, Burkes,
  Jarvis-Judice-Ninke, Stevenson-Arce, Nakano — table-driven kernels with a serpentine
  scan) and special (Ostromoukhov tone-banded weights, Variable-Error, Dot-Diffusion,
  Riemersma decaying error memory).
- **Dither strength and threshold**: strength 0–100% scales the propagated error /
  matrix influence (0% = plain nearest colors); the ordered threshold bias 0–255 shifts
  the tone cutoff.
- **Pre/post pipeline**: pre-dither gaussian blur, unsharp sharpen, hue rotation, median
  denoise and smoothing; post-dither screen-blend glow (radius + intensity), horizontal
  chromatic aberration, and post denoise/smoothing — all re-snapped onto the palette so
  the result stays vector-clean through SVG export.
- **Palette blend**: synthetic midpoint colors between luminance-adjacent palette colors
  (up to 64 entries) used for conversion, producing smoother dithered ramps.
- **Palette library grows from 15 to 23**: B&W, Game Boy Pocket, NES, ZX Spectrum,
  CGA Mode 4, Macintosh, Teletext, Gruvbox (canonical published colors).
- **Palette file import/export**: parse `.hex` (Lospec), GIMP `.gpl` and loose hex text;
  palette images are sampled via median cut; export as `.hex`, `.gpl` or a PNG strip.
- **Import presets**: ten one-click recipes (Game Boy, Pocket, Macintosh, Newspaper,
  Halftone, NES, ZX Spectrum, Vaporwave, Teletext, Gruvbox), each a complete
  ImportOptions snapshot that syncs the palette select.
- **Fill pattern library grows from 16 to 20**: cluster, halftone, blue-noise and
  void-and-cluster join the ordered dithers.
- **Four new built-in editor presets**: Teletext, CGA Terminal, Macintosh Classic,
  Gruvbox Study.
- The import dialog groups the algorithm select (off / ordered / diffusion / special)
  and exposes every new slider with live preview; all strings ship in EN and RU.

## Capabilities

### Added

- `import-image`: the photo-to-pixels pipeline — fit sampling, pre-processing, palette
  choices with blending, the dithering algorithm library with strength/threshold,
  post-processing, and import presets.
- `palettes`: the built-in palette library, palette blending, and palette file
  import/export.

## Non-Goals

- Video/animation dithering, temporal effects, batch processing (deferred by request).
- JPEG-glitch, CMYK halftone separation, stackable effect pipelines.
- New export formats (MP4/JPEG); SVG/PNG/JSON export already covers the results.
