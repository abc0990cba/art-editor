# import-image — Delta

## MODIFIED Requirements

### Requirement: Dithering algorithm library

Image import SHALL convert photos to cells using one of 55 dithering algorithms plus an
off mode, grouped in the dialog as ordered, error-diffusion, scan-paths, special and
glyph:

- **Ordered additions**: Bayer 32×32; rosette, elliptical and Euclidean print screens;
  horizontal, vertical and diagonal line screens; interleaved gradient noise; a
  generated 16×16 blue-noise mask; spiral, rings, sunburst, phyllotaxis, zigzag and
  fractal-noise threshold fields; basket-weave, twill and houndstooth pattern ranks;
  and a custom matrix — the user's glyph tile set projected into the threshold field
  (Bayer 4 fallback when unset).
- **Error diffusion additions**: Sierra-2, 1D horizontal diffusion, horizontally and
  vertically anisotropic spread.
- **Scan paths** (decaying error memory along a scan path): column serpentine,
  anti-diagonal sweeps, rectangular spiral, Hilbert curve, seeded-random order.
- **Special additions**: Yliluoma palette-mix search, noise-threshold FS, edge-aware FS.

Every algorithm SHALL map its output onto the conversion palette and SHALL be
deterministic for identical inputs. Threshold-matrix algorithms SHALL bias dark cells
at high threshold bias and light cells at low bias. Diffusion, path, special and glyph
algorithms at strength 0 SHALL reduce to plain nearest-color mapping.

#### Scenario: Custom threshold matrix

- **WHEN** the user picks a glyph tile set and selects the custom-matrix dither
- **THEN** the conversion compares each pixel tone against the tile set's threshold
  field; with no set selected Bayer 4 is used

#### Scenario: Scan-path determinism

- **WHEN** a scan-path algorithm (including the random order) converts the same photo
  twice with identical options
- **THEN** both conversions produce identical cell buffers

#### Scenario: Yliluoma stays on the palette

- **WHEN** Yliluoma mixing search runs against any palette
- **THEN** every output cell references a palette color, never a blended color
