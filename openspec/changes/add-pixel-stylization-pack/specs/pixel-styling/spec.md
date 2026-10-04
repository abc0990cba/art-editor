# pixel-styling — Delta

## ADDED Requirements

### Requirement: Extrude render mode

The editor SHALL offer an `extrude` render mode: every painted cell SHALL grow a flat body of
`extrude.depth` (1..8) buffer cells along one 8-way direction (`extrude.dx`/`dy`, never both
zero) into empty space, rendered as one merged path BEFORE the regular pixels-mode fill in
`extrude.color` — a palette value, where 0 SHALL resolve to the darkest palette color. Body
rays SHALL stop at the canvas border and at any painted cell. The extrude settings SHALL freeze
into elements like every style block and participate in style-group merging.

#### Scenario: Body renders behind the fill

- **WHEN** a single cell renders with depth 2, direction ↘, and a distinct body color
- **THEN** the geometry lists the body path first and the fill path second, with body cells
      exactly at the two offset positions

#### Scenario: Rays stop at ink

- **WHEN** every cell of a row is painted and the extrusion runs along the row
- **THEN** no body path is emitted (every ray is immediately occluded)

#### Scenario: Auto body color

- **WHEN** `extrude.color` is 0 on the default palette
- **THEN** the body renders in the darkest palette entry
