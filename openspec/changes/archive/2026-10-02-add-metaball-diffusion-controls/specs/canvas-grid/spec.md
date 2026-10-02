# canvas-grid — Delta

## MODIFIED Requirements

### Requirement: Canvas overlays

The editor SHALL render overlays that do not affect export: an optional pixel grid, a
transparency checkerboard behind the artwork when no background color is set, symmetry guides
when enabled, and the metaball diffusion guides when metaball mode and the guides toggle are
active. The grid overlay toggle, the major-line interval and the diffusion-guides toggle SHALL
persist across sessions.

#### Scenario: Grid overlay toggle

- **WHEN** the grid overlay is enabled and zoom is at least 4×
- **THEN** cell boundaries are drawn on the viewport but appear in neither SVG nor PNG export

#### Scenario: Overlay preferences survive reload

- **WHEN** the user turns the pixel grid off, sets major lines to 8 and reloads the editor
- **THEN** the grid stays hidden and the major-line interval is restored to 8

#### Scenario: Diffusion guides only in metaball mode

- **WHEN** the render mode is pixels or outline
- **THEN** the diffusion-guides toggle is not offered and no diffusion aids are drawn
