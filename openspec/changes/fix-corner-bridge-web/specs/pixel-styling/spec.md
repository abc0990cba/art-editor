# pixel-styling — Delta

## MODIFIED Requirements

### Requirement: Diagonal connectivity modes

The editor SHALL offer a connectivity setting with three values — `edge` (only edge-adjacent
cells join), `corner` (same-color cells touching at a corner join through the shared corner
point), and `corner-bridge` (corner join plus a square web fused into the silhouette at each
junction) — and the setting SHALL affect outline and metaball rendering.

#### Scenario: Outline pinch

- **WHEN** outline mode is active with connectivity `corner` and two same-color cells touch at a
  corner
- **THEN** the silhouette is a single closed path flowing through the shared corner instead of
  two separate shapes

#### Scenario: Corner bridge web

- **WHEN** connectivity is `corner-bridge` for the same drawing
- **THEN** the silhouette loop grows a square detour into each empty quadrant of the junction,
  producing one continuous path that reads as the two squares joining, with no separate overlay
  path and no circular bulge at any radius

#### Scenario: Metaball junction merge

- **WHEN** metaball mode is active with connectivity `corner` at low strength and two same-color
  cells touch at a corner
- **THEN** their blobs merge through the junction instead of staying separate

#### Scenario: Edge mode unchanged

- **WHEN** connectivity is `edge` for the same drawings
- **THEN** corner-touching cells render as separate shapes in outline and metaball modes

## ADDED Requirements

### Requirement: Junction web fusion

The Corner + Bridge web SHALL be a square detour of the silhouette loop at each pinch vertex,
sized by the concave radius (zero radius SHALL reproduce `corner` mode exactly). Its two reflex
corners SHALL be filleted with the concave radius and its outer corner with the convex radius,
tangent-continuous with the cell edges, with straight axis-aligned edges wherever the radii
allow. The web SHALL be symmetric under 90° rotation and reflection so the joint looks identical
in all diagonal directions, and SHALL NOT extend past the neighboring cell envelope by more than
half a step.

#### Scenario: Tangent junction flow

- **WHEN** a diagonal pair is rendered in outline mode with connectivity `corner-bridge` and
  non-zero radii
- **THEN** the outline leaves each cell edge and enters the web through tangent arcs and the
  outer web corner is rounded like a pixel corner, all as one closed path

#### Scenario: No circle degeneration

- **WHEN** the concave radius is at its maximum (50%)
- **THEN** the junction web still shows a square step silhouette (S-shaped tangent wave), not a
  disc

#### Scenario: Zero radius parity

- **WHEN** the concave radius is 0
- **THEN** `corner-bridge` output is byte-identical to `corner` mode output

## REMOVED Requirements

### Requirement: Junction overlay alignment

**(removed — the diamond overlay no longer exists; replaced by Junction web fusion)**
