# pixel-styling Specification

## Purpose
TBD - created by archiving change add-editor-core. Update Purpose after archive.

## Requirements

### Requirement: Corner radius control

The editor SHALL let the user set a uniform corner radius from 0% (sharp square) to 50% (fully
round) of the pixel box, and SHALL offer an advanced per-corner mode with independent radius
sliders for top-left, top-right, bottom-right, and bottom-left corners.

#### Scenario: Round all pixels

- **WHEN** the uniform radius slider is set to 50%
- **THEN** every isolated painted cell renders as a circle in preview and export

#### Scenario: Per-corner override

- **WHEN** per-corner mode is enabled and only the top-left corner is set to 50% while others stay 0%
- **THEN** each painted cell renders with one rounded corner and three sharp corners

### Requirement: Independent X/Y stretch

The editor SHALL let the user scale each pixel's box independently in width and height from 5% to
100% of the cell, keeping it centered. The editor SHALL additionally offer deterministic
per-cell variation: a size spread (`style.sizeJitter`, 0–100%, default 0) that shrinks each
cell's figure by a smooth seeded noise factor, an angle spread (`style.angleJitter`, 0–180°,
default 0) that offsets each rotated form's angle, and a seed (`style.jitterSeed`, 1–9999)
making the variation reproducible. With both spreads at zero the rendering SHALL be identical
to the un-varied path, including the run-merge fast path.

#### Scenario: Stretched dots

- **WHEN** size X is 100% and size Y is 40%
- **THEN** each painted cell renders as a horizontal pill touching its left and right cell edges

#### Scenario: Organic scatter

- **WHEN** the user raises size spread to 60% on a filled region
- **THEN** cell figures vary smoothly in size (neighboring cells correlate, no checkerboard
  flicker) and no figure exceeds its un-varied size

#### Scenario: Reproducible field

- **WHEN** the same document is reloaded or the seed is set back to a previous value
- **THEN** the per-cell size and angle variation is identical to before

#### Scenario: Angle spread on rotated forms

- **WHEN** the form is `square` with rotation 0 and angle spread is set to 90°
- **THEN** each cell's square gains a deterministic angle within ±45° of the base rotation

#### Scenario: Zero spread is free

- **WHEN** both spreads are 0 on a large plain-square document
- **THEN** rendering is unchanged and same-color horizontal runs still merge into single
  rectangles

### Requirement: Shape presets

The editor SHALL offer one-click shape presets (square, rounded, circle) that set the radius
controls accordingly.

#### Scenario: Circle preset

- **WHEN** the user clicks the circle preset
- **THEN** radius becomes 50% and isolated pixels render as circles

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

### Requirement: Palette presets

The editor SHALL offer classic palette presets (PICO-8, Game Boy DMG, Commodore 64, Sweetie 16,
Endesga 32, and the default Classic 12), each shown with a swatch-strip preview in the color
panel, and clicking a preset SHALL apply it to the document.

#### Scenario: Apply recolors by index

- **WHEN** a document has cells painted with palette values 1–N and the user applies a preset
- **THEN** the document palette is replaced by the preset colors and each cell keeps its value,
  so its rendered color becomes the preset color at the same index (values wrap modulo the new
  palette length)

#### Scenario: Undo restores palette

- **WHEN** the user applies a preset and immediately undoes
- **THEN** the previous palette and colors are restored

#### Scenario: Round trip

- **WHEN** a project using an applied preset palette is saved and reloaded
- **THEN** the document palette is restored exactly

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
