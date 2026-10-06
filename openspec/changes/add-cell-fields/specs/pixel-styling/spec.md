# pixel-styling — Delta

## ADDED Requirements

### Requirement: Grid-wide cell fields

In pixels mode the editor SHALL offer position-driven per-cell modulators — size, align
(rotation) and offset — each driven by a deterministic field over the grid, reproducible from
its seed. The size field SHALL scale each cell's figure between the strength floor (`min`) and
the full cell according to the chosen kind (funnel, fountain, dome, edges, rampX, rampY,
rampDiag, waveX, waveY, rings, spiral, checker) with direction (`angle`), wavelength
(`period`), `phase` and `invert` controls. The align field SHALL rotate each figure by the
kind's direction (center, outward, swirl, seeded 90° truchet steps, sine wave). The offset
field SHALL displace each figure inside its cell (vortex, magnet, directional drift, seeded
scatter), never beyond the cell bounds. Fields SHALL compose with tone sizing, X/Y stretch,
size/angle spread, corner rounding and the inner-figure inlay. With every field set to `none`
the rendering SHALL be identical to the un-fielded path, including the run-merge fast path.
Fields SHALL persist in saved projects, flow into style presets, element-scope freezing and
the node graph, and be undoable.

#### Scenario: Funnel

- **WHEN** the size field is `funnel` with strength 100% and min 10%
- **THEN** the cell figure is full-size at the grid center and shrinks smoothly toward the
  corners, neighboring cells correlating without flicker

#### Scenario: Reproducible fields

- **WHEN** the document is reloaded or the seed is restored
- **THEN** the truchet rotations and scatter offsets are identical to before

#### Scenario: Fields compose with the inlay

- **WHEN** an inner figure is enabled and the size field is `funnel`
- **THEN** the inlay shrinks and displaces together with its base figure

#### Scenario: Truchet pattern

- **WHEN** the align field is `truchet` on a grid of quarter-disc-like forms
- **THEN** each cell is rotated by a seeded multiple of 90°, producing a continuous emergent
  pattern across neighbors

#### Scenario: None keeps the fast path

- **WHEN** all three field kinds are `none` on a plain-square document
- **THEN** same-color horizontal runs still merge into single rectangles

#### Scenario: Rotation field leaves plain rects

- **WHEN** the align field is `swirl` with the square form
- **THEN** cells render as rotated squares, not axis-aligned rects

#### Scenario: Fields on non-square grids

- **WHEN** pixels mode is active on the hex grid with a `rings` size field
- **THEN** native cells scale by their distance from the grid center, same as the square grid

### Requirement: Field controls

The editor SHALL expose a field group in the pixel style section, visible only in pixels mode:
kind chips for size/align/offset, strength and floor sliders for size, direction, wavelength
and phase sliders for the periodic kinds, an invert toggle and a seed control with randomize.
Every control SHALL apply through the standard style target pipeline and be undoable.

#### Scenario: Controls hidden outside pixels mode

- **WHEN** the render mode is outline, metaball, contour or extrude
- **THEN** the field group is not shown

#### Scenario: Periodic sliders only when meaningful

- **WHEN** the size field kind is a ramp (non-periodic) and the offset kind is `scatter`
- **THEN** the wavelength/phase sliders are hidden while the seed control stays available
