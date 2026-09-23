# palettes — Delta

## ADDED Requirements

### Requirement: Built-in palette library

The editor SHALL ship a built-in palette library including — alongside the existing
pixel-art and retro sets — B&W (2), Game Boy Pocket (4), NES (16), ZX Spectrum (15),
CGA Mode 4 (4), Macintosh (16), Teletext (8) and Gruvbox (16), using the canonical
published colors, with display names and descriptions in both interface languages.

#### Scenario: Selecting a retro palette

- **WHEN** the user picks the NES palette in the Color section
- **THEN** the document palette becomes the 16 canonical NES colors and the preset row
  highlights it as active

### Requirement: Palette blend for image import

Import options SHALL include a palette blend of 0–100 that inserts synthetic midpoint
colors between luminance-adjacent palette colors (one to three midpoints per pair,
total capped at 64 colors) for use as the conversion palette. Blend SHALL NOT mutate the
source palette choice itself.

#### Scenario: Blend smooths a two-color ramp

- **WHEN** a photo is converted on the B&W palette with blend above 0
- **THEN** the conversion palette gains gray midpoints sorted between black and white,
  and the resulting artwork can use them

#### Scenario: Blend cap

- **WHEN** blending would exceed 64 colors
- **THEN** the number of midpoints per pair is reduced so the result stays within 64

### Requirement: Palette file import and export

The Color section SHALL import palettes from `.hex` lists (one hex per line, with or
without `#`), GIMP `.gpl` files, loose hex text, and palette images (any bitmap, sampled
via median cut), and SHALL export the current document palette as `.hex`, `.gpl` or a
one-row PNG strip. Parsed colors SHALL be normalized to lowercase `#rrggbb`,
deduplicated, and rejected input SHALL be ignored without changing the palette.

#### Scenario: Import a Lospec hex file

- **WHEN** the user imports a `.hex` file containing valid and invalid lines
- **THEN** the document palette becomes the normalized list of parsed colors

#### Scenario: Export round trip

- **WHEN** the current palette is exported as GPL and re-imported
- **THEN** the palette is restored unchanged
