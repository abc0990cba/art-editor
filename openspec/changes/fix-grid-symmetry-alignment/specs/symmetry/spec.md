# symmetry — Delta

## MODIFIED Requirements

### Requirement: Grid support matrix

Repeat/wallpaper modes (the 17 wallpaper groups, brick, half-drop) SHALL apply on the square grid
only; their controls SHALL be disabled with a hint on other grids, and switching away from the
square grid SHALL reset an active repeat mode to none. On non-square grids the finite modes SHALL
resolve copies through lattice-aligned geometric maps: mirror axes SHALL snap from the canvas
middle to the nearest axis whose reflection maps cell centers onto cell centers, the rosette
center SHALL snap to the nearest cell center, and each copy SHALL map the cell's polygon centroid
through the isometry and take the owning cell from the grid hit test. A cell exactly on a mirror
axis SHALL map to itself, mirror copies SHALL be involutive where the lattice has the axis, and
lattices without an exact axis SHALL fall back to the nearest center line deterministically. The
drawn guides SHALL use the same snapped axes and center as the copy math.

#### Scenario: Wallpaper disabled on hex

- **WHEN** the document grid is hexagonal
- **THEN** the wallpaper and repeat chips are disabled with an explanatory hint, while mirrors,
  rosette and diagonal modes remain usable

#### Scenario: Radial connectors on radial grids

- **WHEN** radial symmetry is active on the radial grid and a connector is drawn
- **THEN** rotated copies of the connector appear in the rotated sectors

#### Scenario: Hex mirrors align with the lattice

- **WHEN** vertical mirror is active on a pointy-top hex grid of any column parity
- **THEN** the axis line snaps onto a hex center line or cell boundary, every mirrored copy is an
  exact cell (no half-cell jaggedness), and mirrored pairs resolve identically painting from
  either side

#### Scenario: Cell on the axis stays single

- **WHEN** a cell's center lies exactly on the active mirror axis and the mode is that single
  mirror
- **THEN** the cell's orbit contains only the cell itself — no spurious partner is painted beside
  it

#### Scenario: Six-fold rosette closes on hex

- **WHEN** radial symmetry with N = 6 is active on a hex grid
- **THEN** rotation copies land exactly on hex cells and every copy's orbit is the same cell set
