# grid-types Specification

## Purpose
TBD - created by archiving change add-grid-types. Update Purpose after archive.

## Requirements

### Requirement: Grid selection

The editor SHALL offer grid types — square (default), hexagonal, triangular and radial —
selectable from the UI and stored in the document; `cols`/`rows` denote per-grid cell counts
(hexagonal/triangular: columns × rows; radial: sectors × rings), and the canvas extent SHALL be
derived from the grid geometry for viewport fit, SVG viewBox and PNG export.

#### Scenario: Switch grid preserves artwork approximately

- **WHEN** the user switches the grid type on a painted document
- **THEN** every new cell takes the color of the old cell containing its center

#### Scenario: Project round trip

- **WHEN** a hex-grid project is saved and reloaded
- **THEN** grid type, cell colors and connectors are restored exactly

### Requirement: Per-grid rendering in all pixel styles

All three pixel styles SHALL render on every grid: pixels as rounded cell polygons (honoring
radius, arc/chamfer style and X/Y stretch), outline as the union silhouette traced along shared
polygon edges with convex/concave rounding, metaball as field blobs over cell centers. Different
colors SHALL produce separate silhouettes/blobs.

#### Scenario: Hex pair merges

- **WHEN** outline mode is active on a hex grid and two edge-adjacent same-color cells are painted
- **THEN** the silhouette is a single closed path around both cells with rounded corners

#### Scenario: Radial metaball

- **WHEN** metaball mode is active on a radial grid and adjacent sector cells are painted
- **THEN** their blobs merge into one smooth shape

### Requirement: Square-only features

Sub-cell detail and corner connectivity SHALL apply only to the square grid; their controls SHALL
be hidden for other grids, and switching to a non-square grid SHALL reset sub-cell detail.

#### Scenario: Controls hidden

- **WHEN** the grid type is hexagonal
- **THEN** the sub-cell and connectivity controls are not shown

### Requirement: Per-grid tools

Pointer tools SHALL hit-test through the active grid geometry; connectors SHALL join cell centers
by index; flood fill SHALL spread over the grid's edge adjacency; symmetry for non-square grids
SHALL offer none, radial N-fold and kaleidoscope (mapping through cell-center angles), with
guides for the supported modes.

#### Scenario: Fill follows hex adjacency

- **WHEN** flood fill is used on a hex grid inside a region
- **THEN** the fill spreads over the six edge-adjacent directions

#### Scenario: Radial symmetry stamps

- **WHEN** radial symmetry N=6 is active on any grid and one cell is painted
- **THEN** cells at 60° rotations around the canvas center are painted identically
