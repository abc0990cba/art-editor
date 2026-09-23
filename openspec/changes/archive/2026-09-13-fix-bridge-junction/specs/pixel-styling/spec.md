# pixel-styling — Delta

## ADDED Requirements

### Requirement: Junction overlay alignment

The Corner + Bridge junction overlay SHALL be a diamond centered on the shared corner with
vertices at the midpoints of the four adjacent cell edges, filleted with the concave radius, and
SHALL be symmetric under 90° rotation and reflection so the joint looks identical in all diagonal
directions and never extends beyond the neighboring cell envelope.

#### Scenario: Direction symmetry

- **WHEN** Corner + Bridge is active and two diagonal pairs running along different diagonals
  (down-right vs down-left) are painted
- **THEN** both junction overlays are identical up to translation/reflection, with no circular
  bulge protruding from the silhouette

#### Scenario: Junction reads as a joint

- **WHEN** the bridge overlay is rendered for a diagonal pair
- **THEN** it connects the rounded corners of both cells through the shared corner without
  covering the empty quadrants beyond the midpoints of the surrounding cell edges

### Requirement: Square-only per-corner controls

The per-corner radius controls SHALL be shown only when the grid is square and the render mode is
pixels; non-square cell polygons support only a uniform radius.

#### Scenario: Hidden on hex grid

- **WHEN** the grid type is hexagonal in pixels mode
- **THEN** the per-corner toggle and its sliders are not shown, while the uniform corner radius
  slider remains
