# metaball-rendering — Delta

## ADDED Requirements

### Requirement: Metaball merge mode

The editor SHALL offer a metaball render mode in which adjacent painted cells merge into smooth
liquid blobs, controlled by a strength value 0–100 that grows the merge radius from the cell size
up to roughly 1.6 cells.

#### Scenario: Two cells merge

- **WHEN** metaball mode is enabled with moderate strength and two horizontally adjacent cells are
  painted
- **THEN** the viewport and export show a single smooth blob spanning both cells instead of two
  separate shapes

#### Scenario: Toggle back to shapes

- **WHEN** metaball mode is disabled
- **THEN** cells render as discrete styled pixel shapes

### Requirement: Per-color isolation

The editor SHALL compute metaball fields per color by default so that blobs of different colors
never blend, with an option to merge all colors into one field.

#### Scenario: Red and blue stay separate

- **WHEN** a red pixel and a blue pixel merge with their own neighbors while per-color isolation is
  on
- **THEN** the red blob and the blue blob render as distinct solid-color paths

### Requirement: Shared geometry pipeline

The metaball contours SHALL be produced by the same geometry engine used for SVG export, so the
canvas preview and exported SVG paths are identical.

#### Scenario: Export parity

- **WHEN** an SVG is exported while metaball mode is active
- **THEN** the SVG paths match the shapes visible in the viewport, not a filtered raster effect

### Requirement: Field quality

The editor SHALL expose a field quality setting (low/medium/high) controlling samples per cell so
users can trade contour smoothness for responsiveness on large grids.

#### Scenario: Large grid stays responsive

- **WHEN** a 100×100 grid uses low quality
- **THEN** geometry recomputes fast enough to follow a pencil stroke without visible lag
