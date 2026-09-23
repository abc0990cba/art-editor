# import-image — Delta

## ADDED Requirements

### Requirement: Dithering algorithm library

Image import SHALL convert photos to cells using one of 23 dithering algorithms plus an
off mode, grouped in the dialog as ordered, error-diffusion and special:

- **Ordered** (tone compared against a threshold matrix): Bayer 2×2, 4×4, 8×8, 16×16,
  clustered-dot, halftone, blue-noise, void-and-cluster, diagonal pattern, and a
  procedural crosshatch field;
- **Error diffusion** (coefficient kernels over a serpentine scan, mirrored on
  right-to-left rows): Floyd–Steinberg, Atkinson, Sierra, Sierra-Lite, Stucki, Burkes,
  Jarvis-Judice-Ninke, Stevenson-Arce, Nakano;
- **Special**: Ostromoukhov (tone-banded weights), Variable-Error (tone-sliding weights),
  Dot-Diffusion (class-scaled spread), Riemersma (decaying error memory along the scan).

Every algorithm SHALL map its output onto the conversion palette and SHALL be
deterministic for identical inputs.

#### Scenario: Ordered dither keeps flat colors stable

- **WHEN** a photo of one exact palette color is converted with any ordered algorithm
- **THEN** every cell receives that palette color (no dither noise is invented)

#### Scenario: Determinism

- **WHEN** the same bitmap is converted twice with identical options
- **THEN** both conversions produce identical cell buffers

#### Scenario: Algorithm groups in the dialog

- **WHEN** the import dialog dither select is opened
- **THEN** the algorithms are listed under Off, Ordered, Error diffusion and Special groups

### Requirement: Dither strength and threshold

Import options SHALL include a dither strength of 0–100% that scales the propagated
error of diffusion algorithms and the threshold-matrix influence of ordered algorithms,
and an ordered threshold bias of 0–255 that shifts the tone cutoff. At strength 0 every
diffusion algorithm SHALL reduce to plain nearest-color mapping.

#### Scenario: Strength zero disables diffusion

- **WHEN** any diffusion algorithm runs with strength 0
- **THEN** the result equals the off (nearest) conversion for the same palette

#### Scenario: Threshold bias direction

- **WHEN** a midtone photo is converted with an ordered algorithm at threshold 255
- **THEN** dark cells dominate; at threshold 0 light cells appear

### Requirement: Pre-processing

Import options SHALL include pre-dither gaussian blur (0–10), unsharp sharpen (0–100),
hue rotation (−180…180), median denoise (0–5) and smoothing (0–5), applied to the
resampled photo before palette quantization and dithering.

#### Scenario: Denoise removes specks

- **WHEN** a photo with isolated bright specks on a dark field is imported with
  pre-denoise ≥ 1
- **THEN** the specks no longer produce bright cells

### Requirement: Post-processing

Import options SHALL include a screen-blend glow (radius 0–24, intensity 0–100) applied
to the dithered result, horizontal chromatic aberration (0–12 px, red left / blue right),
and post denoise/smoothing (0–5). After post processing every cell SHALL be re-snapped to
the conversion palette, so the artwork stays expressible as clean palette geometry.

#### Scenario: Glow brightens across the palette

- **WHEN** a hard white-to-black edge is imported with glow radius and intensity above 0
- **THEN** cells near the edge inside the dark side gain a brighter palette color than
  the same conversion without glow

#### Scenario: Post results stay on the palette

- **WHEN** any combination of glow, aberration, post denoise and smoothing is applied
- **THEN** every resulting cell references the conversion palette

### Requirement: Import presets

The import dialog SHALL offer built-in one-click presets, each pinning a complete
ImportOptions snapshot (placement, palette, dithering, processing) and syncing the
palette select. Preset ids SHALL be unique and every option value SHALL stay inside its
slider range.

#### Scenario: Applying a preset

- **WHEN** the user clicks the Game Boy import preset
- **THEN** palette, dither and processing controls switch to the preset's values and the
  live preview re-renders
