# gradient-trace — Delta (new capability)

## ADDED Requirements

### Requirement: Gradient fitting pipeline

The engine SHALL convert a raster image into an SVG of region paths whose paints are solid colors,
`linearGradient` or `radialGradient` fills (piecewise-linear stops in sRGB), optionally stacked
with semi-transparent radial spot layers composited source-over. Region geometry SHALL come from
color clustering plus outline tracing; each region SHALL receive the simplest paint model whose
mean ΔE2000 stays within the configured tolerance, gated by a quadratic smoothness test. The
pipeline SHALL also produce a downsampled ΔE2000 heatmap of the composite vs the source.

#### Scenario: A raster linear gradient becomes an SVG linearGradient

- **WHEN** an image of a banded 8-bit linear ramp is traced
- **THEN** the output SVG contains a `linearGradient` with `gradientUnits="userSpaceOnUse"` whose
  direction matches the ramp within 1.5° and the mean ΔE stays within the tolerance

#### Scenario: A spot the base fit misses is absorbed by a layer

- **WHEN** a soft bright spot sits on a smooth gradient and stacked mode is on
- **THEN** the fit adds at least one spot layer and the composite mean ΔE is lower than the single
  mode's

### Requirement: Gradient workspace

The app SHALL provide a gradient workspace for `kind: 'gradient'` projects: import surface, live
preview (result / original / ΔE heatmap), parameter panel (presets, fit mode, ΔE tolerance, stop
budget, segmentation coarseness, region minimum, layer budget) and SVG export/copy. Changes SHALL
autosave into the bound library entry, throttled. Exported SVG SHALL use only the AI-safe subset:
paths, `linearGradient`/`radialGradient` with `gradientUnits="userSpaceOnUse"`, `stop-opacity` —
no blend modes, no CSS-composited fills.

#### Scenario: Tuning the tolerance refits the image

- **WHEN** the user moves the ΔE tolerance slider with an image imported
- **THEN** the workspace re-fits via the worker and the preview updates; superseded worker
  responses are dropped
