# canvas-grid — Delta

## ADDED Requirements

### Requirement: Grid sizing

The editor SHALL provide width and height inputs for the pixel grid constrained to 1–100 cells
each, and SHALL resize the document buffer live when a value changes, preserving existing content
anchored at the top-left corner.

#### Scenario: Resize wider

- **WHEN** the user changes grid width from 16 to 24 while cells at (3,3) are painted
- **THEN** the buffer becomes 24 columns wide and the pixel at (3,3) remains painted

#### Scenario: Boundary clamping

- **WHEN** the user enters 0 or 101 for a grid dimension
- **THEN** the value is clamped into the 1–100 range

### Requirement: Viewport navigation

The editor canvas viewport SHALL support zoom via mouse wheel and pan via space-drag or middle
mouse drag, and SHALL offer a fit-to-view action that frames the whole grid.

#### Scenario: Zoom into the canvas

- **WHEN** the user scrolls the wheel up over the canvas
- **THEN** the zoom level increases around the cursor position

### Requirement: Canvas overlays

The editor SHALL render overlays that do not affect export: an optional pixel grid, a transparency
checkerboard behind the artwork when no background color is set, and symmetry guides when enabled.

#### Scenario: Grid overlay toggle

- **WHEN** the grid overlay is enabled and zoom is at least 4×
- **THEN** cell boundaries are drawn on the viewport but appear in neither SVG nor PNG export
