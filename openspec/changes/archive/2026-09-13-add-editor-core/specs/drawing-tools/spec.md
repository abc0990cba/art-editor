# drawing-tools — Delta

## ADDED Requirements

### Requirement: Pencil and eraser

The editor SHALL provide a pencil tool that paints the active color into the hovered cell and an
eraser tool that clears cells; both SHALL apply while dragging, and each stroke SHALL commit as a
single undo step on pointer release.

#### Scenario: Paint a stroke

- **WHEN** the user presses the pointer and drags across five cells with the pencil
- **THEN** all five cells hold the active color and undo reverts all five at once

#### Scenario: Eraser clears connectors

- **WHEN** the eraser is used on a position within a connector's hit distance
- **THEN** that connector is removed

### Requirement: Flood fill and eyedropper

The editor SHALL provide a flood fill tool that replaces the connected region of identical cell
values under the pointer with the active color, and an eyedropper that sets the active color from
the hovered painted cell.

#### Scenario: Fill an enclosed region

- **WHEN** flood fill is used inside a closed outline
- **THEN** only cells connected to the start cell adopt the new color

### Requirement: Shape tools

The editor SHALL provide line, rectangle, and ellipse tools with live drag preview; the preview
SHALL render with the current style settings, and releasing the pointer SHALL commit the stamped
shape (through the active symmetry mapping) as one undo step.

#### Scenario: Draw a line with live preview

- **WHEN** the user drags from cell A to cell B with the line tool
- **THEN** the viewport shows the styled line following the pointer before commit

### Requirement: Connector tool

The editor SHALL provide a connector tool: a first click sets the start cell, a second click on a
different cell commits a thick rounded trace between the two cell centers, and connectors SHALL
render as capsules in both preview and export and participate in the metaball field.

#### Scenario: Connect two cells

- **WHEN** the user clicks cell A then cell D with the connector tool
- **THEN** a rounded capsule of the active color and configured width joins the centers of A and D

### Requirement: Tool shortcuts

The editor SHALL activate tools via single-key shortcuts: pencil B, eraser E, fill G, eyedropper I,
line L, rectangle R, ellipse O, connector C.

#### Scenario: Switch tool by key

- **WHEN** the user presses E while the pencil is active
- **THEN** the eraser becomes the active tool
