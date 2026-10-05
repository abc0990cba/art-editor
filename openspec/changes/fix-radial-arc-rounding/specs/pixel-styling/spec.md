# pixel-styling — Delta

## MODIFIED Requirements

### Requirement: Grid-aware rounding

On every lattice the rounding SHALL produce tangent corner fillets. In pixels mode on
non-square grids the cell radius SHALL be a fraction of the cell's shortest true edge
(collinear split vertices and arc samples merged into their edge run), so the maximum radius
rounds each native cell to its roundest form — a hexagon to a circle-like shape, a radial
wedge to a leaf. In outline mode fillets SHALL land only on true silhouette corners;
collinear T-junction splits and arc-sample vertices SHALL be passed through unrounded.
Radial arc polygons SHALL subdivide each arc stop interval adaptively so every sample turn
stays under the corner threshold, keeping coarse sectors and even-graded inner rings smooth.
Loops with one or two true corners SHALL round those corners like any other; only corner-free
loops SHALL fall back to plain polygons.

#### Scenario: Coarse sectors stay smooth

- **WHEN** outline mode is active on a uniform radial grid with 8 or fewer sectors per ring
- **THEN** each isolated wedge shows exactly its four true-corner fillets and no fillet at
  arc-sample vertices

#### Scenario: Even-graded center ring rounds

- **WHEN** pixels mode with radius 50% renders the innermost ring of an even-graded radial
  grid (two sectors — half-disc wedges)
- **THEN** each half-disc rounds at its two true corners sized by the merged diameter run
  instead of emitting a plain polygon

#### Scenario: Merged center disc is corner-free

- **WHEN** both innermost half-disc sectors of an even-graded radial grid are painted in
  outline mode
- **THEN** the silhouette is the sampled circle with no fillet and no seam artifacts
