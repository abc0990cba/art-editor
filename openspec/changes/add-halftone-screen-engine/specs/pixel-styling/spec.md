# pixel-styling — Delta

## ADDED Requirements

### Requirement: Halftone marks and lattices

The texture halftone effect SHALL render its marks as vector silhouettes honoring the
configured speck shape (dots, squares, stars, rings, …), and SHALL place marks on a
choice of lattices: the classic rotated grid, hexagon-offset rows, concentric rings,
sunburst rays, an Archimedean spiral, phyllotaxis, or a blue-noise stipple. Non-grid
lattices SHALL cap mark sizes below touching so the evenodd fill rule never produces
false holes, and SHALL be deterministic for a given seed.

#### Scenario: Star halftone exports as vector stars

- **WHEN** a region has the halftone texture with the star shape
- **THEN** the emitted fragments are star polygon outlines (no circle arcs), identical
  in canvas, PNG and SVG output

#### Scenario: Phyllotaxis reproducibility

- **WHEN** the same region renders twice with the phyllotaxis lattice and one seed
- **THEN** both fragment strings are identical

# import-image — Delta

## ADDED Requirements

### Requirement: Print screen dithers

Import SHALL offer `screen-45` (rotated clustered dot screen), `screen-wave` (wavy
line screen) and `cmyk` — a four-plate process separation screened at the rosette
angles (C 15°, M 75°, Y 0°, K 45°) and composited subtractively before the palette
snap. All three SHALL stay deterministic, remain on the conversion palette, and reduce
to nearest-color mapping at strength 0.

#### Scenario: CMYK stays on the palette

- **WHEN** a photo is imported with the cmyk dither against any palette
- **THEN** every output cell references a palette color

## MODIFIED Requirements

### Requirement: Declarative dither catalog

The catalog gains the `screen-45` and `screen-wave` ordered rows and the `cmyk`
special row; the dialog groups and gallery derive them without UI changes.
