# grid-types — Delta

## ADDED Requirements

### Requirement: Flat-top hexagon lattice

The editor SHALL offer a `hexFlat` grid type: flat-top hexagons in an odd-q offset (odd columns
shifted down half a step), the mirror orientation of the pointy-top `hex` grid. The hit test
SHALL use pixel→axial conversion with cube rounding, exact O(1), with correct tie-breaking, and
interior cells SHALL have 6 edge neighbors.

#### Scenario: Round trip

- **WHEN** every cell center of a hexFlat grid is hit-tested
- **THEN** each returns its own cell index

### Requirement: Rhombille lattice

The editor SHALL offer a `rhombille` grid type: each pointy-top hexagon of the hex lattice is
split by its three long diagonals into three 60° lozenges (three lozenges per hexagon, indexed
`3h`, `3h+1`, `3h+2`). The hit test SHALL resolve the host hexagon by cube rounding and then the
120° lozenge sector of the point; lozenges SHALL share edges exactly (2 hex-edge neighbors + 2
inner-diagonal neighbors each) so the generic edge-key adjacency, flood fill, outline tracing
and metaball fields work unmodified.

#### Scenario: Three lozenges per hexagon

- **WHEN** a rhombille grid is built from 6×4 hexagons
- **THEN** the cell count is 72 and every lozenge's polygon stays inside the canvas extent

#### Scenario: Sector hit

- **WHEN** points are probed at ~10°, ~100° and ~260° from a hexagon center
- **THEN** the hit test returns the three distinct lozenges of that hexagon in order

#### Scenario: Rotation and conversion

- **WHEN** a document converts from square to rhombille (and back) or the rhombille grid
      rotates
- **THEN** the generic conversion and rotation pipelines work without special cases
