# canvas-grid Specification

## Purpose
TBD - created by archiving change add-editor-core. Update Purpose after archive.

## Requirements

### Requirement: Grid sizing

The editor SHALL provide width and height inputs for the pixel grid constrained to 1–512 cells
each, plus square size presets (32, 64, 128, 256, 512) that set both dimensions at once. The
editor SHALL resize the document buffer live when a value changes, preserving existing content
anchored at the top-left corner.

#### Scenario: Resize wider

- **WHEN** the user changes grid width from 16 to 24 while cells at (3,3) are painted
- **THEN** the buffer becomes 24 columns wide and the pixel at (3,3) remains painted

#### Scenario: Boundary clamping

- **WHEN** the user enters 0 or 513 for a grid dimension
- **THEN** the value is clamped into the 1–512 range

#### Scenario: Apply a size preset

- **WHEN** the user clicks the 128 preset chip
- **THEN** the grid becomes 128×128 cells and existing artwork is kept anchored top-left

### Requirement: Viewport navigation

The editor canvas viewport SHALL support zoom via mouse wheel and pan via space-drag or middle
mouse drag, and SHALL offer a fit-to-view action that frames the whole grid via a toolbar button,
a canvas overlay button, and the F hotkey.

#### Scenario: Zoom into the canvas

- **WHEN** the user scrolls the wheel up over the canvas
- **THEN** the zoom level increases around the cursor position

#### Scenario: Fit the canvas by hotkey

- **WHEN** the user presses F
- **THEN** the viewport zooms and centers so the whole grid is visible

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
