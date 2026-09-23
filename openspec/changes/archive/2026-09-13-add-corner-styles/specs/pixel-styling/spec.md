# pixel-styling — Delta

## ADDED Requirements

### Requirement: Separate convex and concave outline radii

In outline mode the editor SHALL expose two radius settings — convex radius and concave radius
(each 0–50% of the cell) — and SHALL round the silhouette's outer corners with the convex radius
and its inner corners with the concave radius. A zero value SHALL keep the corresponding corners
sharp.

#### Scenario: Sharp inner corners

- **WHEN** outline mode is active with convex radius 42% and concave radius 0% on an L-shape
- **THEN** the outer corners are filleted while the inner corner remains a sharp right angle

#### Scenario: Both zero equals sharp outline

- **WHEN** both radii are 0%
- **THEN** the silhouette is the exact staircase union of the cells

### Requirement: Chamfer corner style

The editor SHALL offer a corner style setting — `arc` (default) or `chamfer` — where chamfer
replaces every circular corner arc with a straight 45° cut of the same tangent length, in pixels
mode (per cell corner, honoring per-corner radii) and in outline mode (per silhouette corner).

#### Scenario: Chamfered pixels

- **WHEN** pixels mode is active with corner style chamfer and radius 50%
- **THEN** isolated cells render as diamonds (straight cuts) instead of circles

#### Scenario: Chamfered outline

- **WHEN** outline mode is active with corner style chamfer and convex radius 42%
- **THEN** silhouette corners are straight 45° cuts with no arc commands

### Requirement: Direction-invariant rounding

Rounding SHALL be geometrically consistent across orientations: a group of cells and the same
group rotated by 90° (or reflected) SHALL produce equivalent outlines and metaball blobs, and
fillet/chamfer sizes SHALL clamp to half of the adjacent edge length so short edges never produce
invalid paths. This SHALL hold for horizontal, vertical and diagonal adjacencies in pixels,
outline and metaball modes.

#### Scenario: Rotated pair equivalence

- **WHEN** two horizontally adjacent cells and the same pair rotated 90° are rendered in outline
  mode
- **THEN** the produced paths are identical up to the rotation transform
