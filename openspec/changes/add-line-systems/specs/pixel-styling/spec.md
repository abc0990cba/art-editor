# pixel-styling — Delta

## ADDED Requirements

### Requirement: Hatch texture effect

The texture panel SHALL offer a `hatch` effect that carves parallel screen lines into the fill
as evenodd hole fragments: `hatchStyle` selects straight lines or a crossed pair of systems at
angle and angle + 90°; `angle` rotates the system; `scale` sets the line spacing; `amount`
sets line width as a share of the spacing; `ramp` applies a directional width gradient;
`wobble` waves the lines; `dropout` drops noise-clustered segments; `variation` jitters line
widths. Rendering SHALL be clipped to the painted fills (corner fillets and gap margins
included), deterministic for a given seed, and identical across canvas, PNG and SVG output.

#### Scenario: Straight hatch is deterministic

- **WHEN** the same region renders twice with the hatch effect, style straight, one seed
- **THEN** both fragment strings are identical

#### Scenario: Cross hatch covers both directions

- **WHEN** a filled region renders with `hatchStyle: 'cross'` at angle 45°
- **THEN** line fragments exist in both the 45° and 135° directions

#### Scenario: Hatch clips to the artwork

- **WHEN** the effect runs on a region with rounded corners and a gap margin
- **THEN** no line fragment extends outside the painted fill area
