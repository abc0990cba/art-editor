# pixel-styling — Delta

## ADDED Requirements

### Requirement: Outer contour rounding mode

The editor SHALL offer an outline render mode in which same-color cells connected by an edge form
a single silhouette traced exactly along cell edges, and the outline's 90° corners — convex and
concave — are rounded with circular fillets sized by the corner-radius setting; shared edges
SHOULD remain straight, and isolated cells SHALL render as rounded cells as in pixels mode.

#### Scenario: Seam between two cells disappears

- **WHEN** outline mode is active and two horizontally adjacent cells are painted
- **THEN** the viewport and export show one silhouette whose shared edge is a straight segment
  with no concave notch at the seam

#### Scenario: L-shape corner count

- **WHEN** outline mode is active with radius above 0 and an L-shape of three cells is drawn
- **THEN** the resulting path contains exactly six fillet arcs (five convex and one concave corner)

#### Scenario: Isolated cell unchanged

- **WHEN** outline mode is active and a single cell is painted with radius 50%
- **THEN** it renders as a rounded square equivalent to pixels mode at full cell size

### Requirement: Render mode selection

The editor SHALL expose three render modes — pixels, outline, metaball — as an explicit selection
in the pixel style panel; metaball controls SHALL show only in metaball mode, per-corner and
stretch controls only in pixels mode; the selection SHALL be part of the document and persist in
saved projects.

#### Scenario: Mode switch hides controls

- **WHEN** the user selects outline mode
- **THEN** the metaball strength/quality controls and the per-corner/stretch controls are hidden,
  and the corner radius control remains

#### Scenario: Old project migration

- **WHEN** a project saved with `metaball.enabled: true` is loaded
- **THEN** the render mode resolves to metaball, and a project with `metaball.enabled: false`
  resolves to pixels mode
