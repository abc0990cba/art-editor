# pixel-styling — Delta

## ADDED Requirements

### Requirement: Diagonal connectivity modes

The editor SHALL offer a connectivity setting with three values — `edge` (only edge-adjacent
cells join), `corner` (same-color cells touching at a corner join through the shared corner
point), and `corner-bridge` (corner join plus a rounded square bridge overlay centered on the
shared corner) — and the setting SHALL affect outline and metaball rendering.

#### Scenario: Outline pinch

- **WHEN** outline mode is active with connectivity `corner` and two same-color cells touch at a
  corner
- **THEN** the silhouette is a single closed path flowing through the shared corner instead of
  two separate shapes

#### Scenario: Corner bridge overlay

- **WHEN** connectivity is `corner-bridge` for the same drawing
- **THEN** the geometry additionally contains a rounded square overlay centered on the shared
  corner, and the junction reads as a solid joint

#### Scenario: Metaball junction merge

- **WHEN** metaball mode is active with connectivity `corner` at low strength and two same-color
  cells touch at a corner
- **THEN** their blobs merge through the junction instead of staying separate

#### Scenario: Edge mode unchanged

- **WHEN** connectivity is `edge` for the same drawings
- **THEN** corner-touching cells render as separate shapes in outline and metaball modes

### Requirement: Connectivity setting scope

The connectivity setting SHALL apply only in outline and metaball render modes (pixels mode
renders cells independently), SHALL be undoable as part of the document, and SHALL round-trip
through project save/load.

#### Scenario: Mode-dependent visibility

- **WHEN** the render mode is `pixels`
- **THEN** the connectivity control is hidden

#### Scenario: Project round trip

- **WHEN** a project with connectivity `corner-bridge` is saved and reloaded
- **THEN** the connectivity setting is restored as `corner-bridge`
