# svg-studio — Delta (new capability)

## ADDED Requirements

### Requirement: AI-safe authored scenes

The engine SHALL represent an authored vector scene (width, height, background, ordered layers)
where each layer is a shape carrying a stack of paints — solid, `linearGradient` or
`radialGradient` with arbitrary stops (`offset`, color, alpha). Serialization SHALL emit only
the AI-safe subset: paths and basic shapes, gradients with `gradientUnits="userSpaceOnUse"` and
baked coordinates (`gradientTransform` SHALL NOT be emitted), `stop-opacity`, `clipPath`, group
transforms and opacity. SVG filters, `mask`, `mix-blend-mode`, `spreadMethod` values
`reflect`/`repeat` and the focal radius `fr` SHALL NOT be emitted.

#### Scenario: A generated star scene serializes AI-safe

- **WHEN** a light-template star scene is serialized
- **THEN** the SVG contains only `path`/`rect`/`ellipse`/`g`/`clipPath`/gradient/stop elements
  with `userSpaceOnUse` gradients, and a check finds no `filter`, `mask`,
  `mix-blend-mode`, `gradientTransform` or `fr`

#### Scenario: Elliptical radial without gradientTransform

- **WHEN** a radial paint has unequal axis lengths
- **THEN** the layer is wrapped in a transformed group with a circular local-space gradient
  instead of emitting `gradientTransform`

### Requirement: Studio workspace

The app SHALL provide an SVG studio workspace for `kind: 'svgart'` projects: a live stage
rendering the actual serialized SVG, selection with canvas handles (shape move/rotate; linear
axis endpoints; radial center/radius/focus), a layer list (reorder, visibility, opacity), a
per-layer fill stack editor (paint type, stops with offset/color/alpha, order), shape parameter
editors, soft-layer generators (soft shadow / glow / highlight — radial `stop-opacity` falloffs)
with per-effect Illustrator compatibility badges, light-driven templates (star, sphere, aurora)
whose output consists of ordinary editable layers, and an SVG code view with copy/download.
Changes SHALL autosave into the bound library entry, throttled.

#### Scenario: Dragging a gradient axis updates the stage

- **WHEN** the user drags a linear gradient axis handle on the stage
- **THEN** the fill's axis moves, the live SVG re-renders, and the serialized code reflects the
  new coordinates

#### Scenario: A light template generates editable faces

- **WHEN** the user creates a star project from the light template with a light direction
- **THEN** the workspace shows per-face layers whose fills are ordinary gradients the user can
  edit like any other layer
