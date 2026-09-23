# symmetry — Delta

## ADDED Requirements

### Requirement: Symmetry modes

The editor SHALL support symmetry modes: none, vertical mirror, horizontal mirror, 4-way (both
axes), diagonal 8-way, radial N-fold rotation around the canvas center with N from 2 to 24, and
kaleidoscope (N-fold rotation plus mirror, 2N stamps).

#### Scenario: Vertical mirror

- **WHEN** vertical mirror is active and the user paints a cell at x = 5 on a 32-wide grid
- **THEN** the cell at x = 26 (its mirror) is painted identically

#### Scenario: Radial fold count

- **WHEN** radial symmetry with N = 6 is active and one cell is painted
- **THEN** five additional copies appear, rotated by 60° steps around the canvas center

### Requirement: Symmetry applies to drawing operations

Symmetry SHALL map every stamped point of pencil, eraser, line, rectangle, ellipse, and connector
operations before writing to the buffer; fill and eyedropper SHALL operate without symmetry.

#### Scenario: Mirrored line

- **WHEN** 4-way symmetry is active and a line is drawn in one quadrant
- **THEN** mirrored copies of the line appear in the other three quadrants as one commit

### Requirement: Symmetry guides

The editor SHALL draw optional guide overlays (axis lines for mirrors, radial spokes and a center
circle for radial/kaleidoscope) that never appear in exports.

#### Scenario: Guides off in export

- **WHEN** symmetry guides are visible and the user exports SVG or PNG
- **THEN** the guides do not appear in the exported file
