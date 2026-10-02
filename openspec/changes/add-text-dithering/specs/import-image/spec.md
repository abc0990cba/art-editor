# import-image — Delta

## ADDED Requirements

### Requirement: Character and braille dithers

Import SHALL offer `ascii` — tone-mapped letter dithering over a density-ordered
character ramp rendered from the embedded bitmap font — and `braille` — tone-mapped
dithering over all 256 eight-dot braille patterns as 2×4 tiles. Both SHALL use their
built-in tile sets without requiring a picker, stay deterministic, remain on the
conversion palette, and reduce to nearest-color mapping at strength 0. A user-picked
glyph set SHALL override the builtin set.

#### Scenario: Braille resolution

- **WHEN** a photo is imported with the braille dither
- **THEN** each cell's tile is drawn from the 2×4 dot ramp and every cell references
  the conversion palette

# export — Delta

## ADDED Requirements

### Requirement: ASCII text export

Export SHALL offer a plain-text render of the artwork: one character per cell, chosen
from a density-ordered ramp by the cell's average palette luminance; empty cells stay
blank and an invert option serves dark backgrounds.

#### Scenario: Dark canvas exports dense characters

- **WHEN** a canvas with a solid dark region is exported as ASCII
- **THEN** every cell of that region maps to the densest ramp character
