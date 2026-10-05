# pixel-styling — Delta

## ADDED Requirements

### Requirement: Grid-aware rounding

On every lattice the rounding SHALL produce tangent corner fillets. In pixels mode on non-square
grids the cell radius SHALL be a fraction of the cell's shortest true edge (collinear split
vertices and arc samples merged into their edge run), so the maximum radius rounds each native
cell to its roundest form — a hexagon to a circle-like shape, a radial wedge to a leaf. In
outline mode fillets SHALL land only on true silhouette corners; collinear T-junction splits and
arc-sample vertices SHALL be passed through unrounded.

#### Scenario: Hexagon circle preset

- **WHEN** pixels mode is active on the hex grid with radius 50%
- **THEN** each cell renders as a rounded hexagon whose six tangent fillets meet at the edge
  midpoints (circle-like), with arc radius = tangent length / tan(30°)

#### Scenario: Radial wedge rounding

- **WHEN** pixels mode is active on the radial grid with radius 25% on an outer-ring wedge
- **THEN** the wedge renders four corner fillets sized by the ring thickness, not by arc-sample
  chords

#### Scenario: No bumps at collinear splits

- **WHEN** outline mode is active with a concave radius above 0 on the triangle grid
- **THEN** the silhouette shows exactly the three corner fillets and no arc at the collinear
  base midpoints

## MODIFIED Requirements

### Requirement: Direction-invariant rounding

Rounding SHALL be geometrically consistent across orientations: a group of cells and the same
group rotated by 90° (or reflected) SHALL produce equivalent outlines and metaball blobs.
Fillet/chamfer tangent lengths SHALL clamp to half of the whole edge run to the neighboring
corners (arc samples included) so short edges and curved runs never produce invalid paths, and
every fillet arc SHALL be tangent to both of its edges — arc radius = tangent length /
tan(turn/2), which equals the tangent length at 90° corners. This SHALL hold for horizontal,
vertical and diagonal adjacencies in pixels, outline and metaball modes, and on every lattice.

#### Scenario: Rotated pair equivalence

- **WHEN** two horizontally adjacent cells and the same pair rotated 90° are rendered in outline
  mode
- **THEN** the produced paths are identical up to the rotation transform

#### Scenario: Tangent fillets on hex

- **WHEN** a hexagon cell is rounded in pixels mode with any radius above 0
- **THEN** each corner arc meets both cell edges tangentially (no kink at the arc joints), with
  arc radius = tangent length / tan(30°)
