# pixel-styling — Delta

## ADDED Requirements

### Requirement: Inner figure inlays

In pixels mode the editor SHALL let the user draw an optional inner figure inside every painted
cell. The inlay SHALL reuse the cell-shape registry (any form, with its own thickness, points
and rotation parameters) or be `none`; it SHALL be scaled to 10–90% of the base figure box and
offset by up to ±50% of that box per axis. The inlay SHALL be painted on top of the base figure
in its own color, resolved per palette value as one of: a fixed palette slot, the cell color
darkened toward black, the cell color lightened toward white (strength set by depth, 0–100%),
the palette's darkest color, or the palette's lightest color. The inlay box SHALL derive from
the base figure box so the inlay follows the figure's tone sizing, X/Y stretch, per-cell size
spread, and per-cell angle spread. The inlay SHALL be part of the document: it persists in
saved projects, participates in element-scope style freezing, flows into style presets and the
`style.pixel` node, and is undoable through the standard style pipeline.

#### Scenario: Ring inside every pixel

- **WHEN** the inlay is enabled with the ring form at scale 40%, no offset, color mode darken,
  depth 40%
- **THEN** every painted cell renders its base figure plus a concentric ring in a darkened
  variant of the cell color, and empty cells render nothing

#### Scenario: Inlay follows tone sizing

- **WHEN** tone-driven size is active and the inlay is on
- **THEN** the inlay shrinks with its base figure and stays centered inside it

#### Scenario: Inlay follows spread

- **WHEN** size and angle spread are active and the inlay is on
- **THEN** each cell's inlay inherits the same per-cell size shrink and angle delta as its base
  figure

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
a shape picker (the same form grid as the cell shape), scale and offset sliders, the form's
thickness/points sliders when its definition exposes them, color mode chips, palette slot
swatches for the slot mode, and a depth slider for darken/lighten modes. The group SHALL be
visible only in pixels mode. Every control SHALL apply through the standard style target
pipeline (global scope patch or element-scope restyle) and SHALL be undoable.

#### Scenario: Controls hidden outside pixels mode

- **WHEN** the render mode is outline, metaball, contour or extrude
- **THEN** the inner-figure group is not shown

#### Scenario: Slot mode shows swatches

- **WHEN** the inlay color mode is set to a fixed palette slot
- **THEN** a swatch row of the document palette is shown and picking a swatch sets the slot

#### Scenario: Depth applies only to derived colors

- **WHEN** the color mode is a fixed slot, palette darkest or palette lightest
- **THEN** the depth slider has no effect on the inlay color
