# pixel-styling — Delta

## MODIFIED Requirements

### Requirement: Inner figure inlays

In pixels mode the editor SHALL let the user draw an optional inner figure inside every painted
cell. The inlay SHALL reuse the cell-shape registry (any form, with its own thickness, points
and rotation parameters) or be `none`; it SHALL be scaled to 10–90% of the base figure box and
offset by up to ±50% of that box per axis. The inlay SHALL be painted on top of the base figure
in its own color, resolved per palette value as one of: a fixed palette slot, the cell color
darkened toward black, the cell color lightened toward white (strength set by depth, 0–100%),
the palette's darkest color, or the palette's lightest color. The inlay box SHALL derive from
the base figure box so the inlay follows the figure's tone sizing, X/Y stretch, per-cell size
spread, per-cell angle spread and grid-wide cell fields. The inlay SHALL be part of the
document: it persists in saved projects, participates in element-scope style freezing, flows
into style presets and the `style.pixel` node, and is undoable through the standard style
pipeline.

The inlay content SHALL have two sources: the registered cell form (`shape`) or a sampled
character (`glyph`). In glyph mode the editor SHALL rasterize the user's character (emoji,
letter or symbol) through the system font stack into a resolution × resolution ink bitmap
(resolution 4–12) and draw one dot per on-bit inside the inlay box — dot silhouette selectable
(square or circle), dot size set by a fill fraction — keeping the output pure vector and
identical in canvas, PNG and SVG rendering.

#### Scenario: Ring inside every pixel

- **WHEN** the inlay is enabled with the ring form at scale 40%, no offset, color mode darken,
  depth 40%
- **THEN** every painted cell renders its base figure plus a concentric ring in a darkened
  variant of the cell color, and empty cells render nothing

#### Scenario: Emoji dot-matrix

- **WHEN** the inlay source is `glyph` with an emoji character at resolution 8
- **THEN** every painted cell renders the emoji as an 8×8 dot matrix in the inlay color, and
  the exported SVG contains the same dot path data (no font dependencies)

#### Scenario: Glyph follows the inlay box

- **WHEN** the inlay source is `glyph` with tone-driven size and a funnel size field active
- **THEN** the dot matrix shrinks, rotates and displaces exactly with its base figure

#### Scenario: Inlay follows tone sizing

- **WHEN** tone-driven size is active and the inlay is on
- **THEN** the inlay shrinks with its base figure and stays centered inside it

#### Scenario: Old projects unchanged

- **WHEN** a project saved before inlays existed is loaded
- **THEN** the inlay resolves to `none` and rendering is identical to before

#### Scenario: Inlay off keeps the fast path

- **WHEN** the inlay is `none` on a plain-square document
- **THEN** same-color horizontal runs still merge into single rectangles

#### Scenario: Element scope keeps both inlays

- **WHEN** two elements are drawn with different inlay settings in element style scope
- **THEN** each element keeps its own inlay when the document is rendered

#### Scenario: Inlay on non-square grids

- **WHEN** pixels mode is active on the hex grid with an inlay enabled
- **THEN** each native cell's figure carries the inlay inside its figure box

### Requirement: Inner figure controls

The editor SHALL expose an inner-figure group in the pixel style section with an enable toggle,
a source toggle (form / character), a shape picker (the same form grid as the cell shape),
scale and offset sliders, the form's thickness/points sliders when its definition exposes them,
color mode chips, palette slot swatches for the slot mode, and a depth slider for darken/lighten
modes. In character mode the group SHALL additionally expose the character field, a resolution
slider, dot shape chips and a dot scale slider. The group SHALL be visible only in pixels mode.
Every control SHALL apply through the standard style target pipeline (global scope patch or
element-scope restyle) and SHALL be undoable.

#### Scenario: Controls hidden outside pixels mode

- **WHEN** the render mode is outline, metaball, contour or extrude
- **THEN** the inner-figure group is not shown

#### Scenario: Glyph mode swaps the controls

- **WHEN** the inlay source is set to `glyph`
- **THEN** the form grid and its shape sliders are replaced by the character field, resolution
  slider, dot shape chips and dot scale slider
