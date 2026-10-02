# import-image — Delta

## ADDED Requirements

### Requirement: Hybrid band dithering

Import SHALL offer a hybrid dither that assigns a separate registered algorithm to
shadows, midtones and highlights, with two luminance split points. Every band SHALL
run through the ordinary algorithm pipeline and the composite SHALL pick each pixel
from its band's run. Selecting hybrid as a band algorithm SHALL be impossible in the
UI and SHALL degrade to nearest-color mapping in the engine. Hybrid SHALL be
deterministic and stay on the conversion palette.

#### Scenario: Uniform tone matches the band algorithm

- **WHEN** a solid midtone image is converted with hybrid whose midtones band is
  blue-noise
- **THEN** the result equals a direct blue-noise conversion of the same image

### Requirement: Posterize with ordered boundary jitter

Import SHALL offer a posterize dither that collapses tones onto 2–32 bands and jitters
the band boundaries with an ordered field scaled by strength; strength 0 SHALL reduce
to plain nearest-color mapping.

#### Scenario: Band count caps the palette usage

- **WHEN** a gray ramp is posterized onto a 4-color gray palette at 3 bands
- **THEN** no more than the palette's colors appear in the result

### Requirement: Duotone pre-map, edge outline and custom ramps

Import options SHALL include: a two-ink gradient map projected onto the sample's
luminance before quantization; an edge-outline overlay that inks detected luminance
edges with the darkest palette color after dithering; and a custom character ramp for
the ascii dither that overrides the builtin ramp when it holds at least two
characters.

#### Scenario: Duotone lands on the inks

- **WHEN** a dark photo is converted with a blue/yellow duotone map and no dither
- **THEN** every output cell references one of the two ink colors, dominated by the
  dark ink
