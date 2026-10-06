# pixel-styling — Delta

## ADDED Requirements

### Requirement: Hollow cells (stroke style)

In pixels mode the editor SHALL offer a stroke block that renders every cell figure as an
outline: stroke width as a fraction of the cell (2–45%), stroke color resolved like the inlay
color (same as the cell color, darkened, or lightened, strength 0–100%), and a fill toggle —
fill off renders hollow outlines, fill on renders filled figures with a stroke rim. The stroke
SHALL apply to the base figure of every painted cell in the square-grid path, the non-square
path and the staged preview; exports (PNG, SVG) SHALL carry identical stroke attributes. With
stroke width 0 the rendering SHALL be identical to the unstroked path. The block SHALL
persist, round-trip through projects and presets, and be undoable.

#### Scenario: Blueprint look

- **WHEN** stroke width is 8% with fill off on a grid of squares
- **THEN** every painted cell renders as a hollow outlined square and the exported SVG paths
  carry `stroke` attributes with `fill="none"`

#### Scenario: Stroke rim with fill

- **WHEN** fill is on with a darkened stroke color
- **THEN** figures render filled with a darker rim following the silhouette

#### Scenario: Zero width is free

- **WHEN** the stroke width is 0
- **THEN** rendering is byte-identical to the unstroked path

### Requirement: Extended cell form catalog

The cell form registry SHALL additionally provide: `quadrant` (corner quarter disc), `bowtie`
(two opposing triangles meeting at the center), `hourglass` (two opposing side triangles),
`keyhole` (disc over a spreading wedge), `eye` (lens silhouette with an iris hole), 
`parallelogram` (skewed bar) and `waveStrip` (horizontal sine band). Every form SHALL render
through the same fragment system as the existing catalog — picker icons, canvas, PNG and SVG
identical — support rotation, and participate in tone sizing, spread, fields and the inlay
like every other registered form.

#### Scenario: Truchet quarter disc

- **WHEN** the form is `quadrant` with the truchet rotation field active
- **THEN** each cell renders a corner quarter disc rotated by a seeded multiple of 90°, and
  neighboring arcs connect into continuous curves

#### Scenario: Eye iris

- **WHEN** the form is `eye` with thickness 30%
- **THEN** the cell renders a lens silhouette with a centered elliptical hole (evenodd)

#### Scenario: Wave band

- **WHEN** the form is `waveStrip` with thickness 30%
- **THEN** the cell renders a horizontal sine band whose thickness sets the band height
