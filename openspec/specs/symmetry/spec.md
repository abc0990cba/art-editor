# symmetry Specification

## Purpose
TBD - created by archiving change add-editor-core. Update Purpose after archive.

## Requirements

### Requirement: Symmetry modes

The editor SHALL support symmetry modes: none, vertical mirror, horizontal mirror, 4-way (both
axes), diagonal 8-way, radial N-fold rotation around the canvas center with N from 2 to 24, and
kaleidoscope (N-fold rotation plus mirror, 2N stamps), plus the repeat modes defined in the
repeat-modes requirement.

#### Scenario: Vertical mirror

- **WHEN** vertical mirror is active and the user paints a cell at x = 5 on a 32-wide grid
- **THEN** the cell at x = 26 (its mirror) is painted identically

#### Scenario: Radial fold count

- **WHEN** radial symmetry with N = 6 is active and one cell is painted
- **THEN** five additional copies appear, rotated by 60° steps around the canvas center

### Requirement: Symmetry applies to drawing operations

Symmetry SHALL apply to pencil, eraser, fill, line, rectangle, ellipse, and connector operations;
the eyedropper SHALL operate without symmetry.

- Pencil/eraser: the brush anchor is mapped through its orbit and the tip is stamped at each copy.
- Fill: the region is flooded from every orbit copy of the seed.
- Shapes: for finite modes (mirrors, 4-way, diagonal, radial, kaleidoscope) the shape's defining
  points SHALL be mapped through each symmetry copy and each copy SHALL be re-rasterized, so every
  mirrored or rotated copy is a correctly drawn shape rather than a point-mirrored raster; repeat
  modes expand each rasterized point through its orbit.
- Connector: both endpoints SHALL be mapped by the same copy, keeping mirrored/rotated connectors
  connected; repeat modes enumerate tiled copies under whole tile operations, capped.

#### Scenario: Mirrored line

- **WHEN** 4-way symmetry is active and a line is drawn in one quadrant
- **THEN** mirrored copies of the line appear in the other three quadrants as one commit

#### Scenario: Ellipse copies stay ellipses

- **WHEN** radial symmetry with N = 6 is active and a wide ellipse is drawn
- **THEN** each rotated copy is a correctly rasterized ellipse, without point-mirroring gaps

#### Scenario: Mirrored connector

- **WHEN** vertical mirror is active and the user connects cells A and D
- **THEN** a mirrored connector joins the mirror copies of A and D in the same commit

### Requirement: Grid support matrix

Repeat/wallpaper modes (the 17 wallpaper groups, brick, half-drop) SHALL apply on the square grid
only; their controls SHALL be disabled with a hint on other grids, and switching away from the
square grid SHALL reset an active repeat mode to none. On hex, triangle and radial grids the
finite modes SHALL apply through polar cell maps (angle reflection/rotation per copy), applied to
both endpoints of a shape or connector pair alike.

#### Scenario: Wallpaper disabled on hex

- **WHEN** the document grid is hexagonal
- **THEN** the wallpaper and repeat chips are disabled with an explanatory hint, while mirrors,
  rosette and diagonal modes remain usable

#### Scenario: Radial connectors on radial grids

- **WHEN** radial symmetry is active on the radial grid and a connector is drawn
- **THEN** rotated copies of the connector appear in the rotated sectors

### Requirement: Symmetry guides

The editor SHALL draw optional guide overlays (axis lines for mirrors, radial spokes and a center
circle for radial/kaleidoscope) that never appear in exports.

#### Scenario: Guides off in export

- **WHEN** symmetry guides are visible and the user exports SVG or PNG
- **THEN** the guides do not appear in the exported file
