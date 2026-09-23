# drawing-tools Specification

## Purpose
TBD - created by archiving change add-editor-core. Update Purpose after archive.

## Requirements

### Requirement: Brush with pixel size and tip

The editor SHALL provide a brush defined by a pixel size N (1..16 cells) and an on/off tip
pattern of N×N cells; a full pattern paints exactly an N×N block of buffer cells. The brush SHALL
apply to pencil, eraser, and shape outlines. On square grids the tip pattern applies as drawn; on
hex, triangle and radial grids the brush SHALL paint a compact blob of N² nearest cells instead.

#### Scenario: Five-cell pixel

- **WHEN** the brush size is set to 5 and the user clicks once with the pencil
- **THEN** a 5×5 block of cells is painted as one stamp

#### Scenario: Custom tip

- **WHEN** the user toggles cells in the tip editor of a size-4 brush
- **THEN** pencil stamps only the active cells of the 4×4 grid at each anchor

### Requirement: Single current brush

The editor SHALL track exactly one current brush. Selecting a brush preset (built-in or user)
SHALL make it the only highlighted brush, and any hand edit to the size or tip pattern SHALL
detach the selection, leaving no preset highlighted until a preset is picked again.

#### Scenario: One active preset

- **WHEN** the user clicks the "Round" brush preset row
- **THEN** only that row is highlighted, even if other presets share the same tip pattern

#### Scenario: Edit detaches selection

- **WHEN** a preset is selected and the user then toggles a cell in the tip editor
- **THEN** no preset row is highlighted and the edited tip is the current brush

### Requirement: Brush placement: snap and free

Brush stamps SHALL snap the tip's top-left anchor to the pixel-size grid anchored at the canvas
origin when snapping is on (the default), so size-N pixels tile perfectly. While Alt is held the
stamp SHALL be placed freely, centered under the cursor. Shape endpoints SHALL follow the same
rule.

#### Scenario: Snapped blocks tile

- **WHEN** snapping is on with pixel size 5 and the user clicks at columns 3 and 7
- **THEN** both stamps land on columns 0 and 5 respectively

#### Scenario: Free placement

- **WHEN** the user holds Alt and clicks with the size-5 brush
- **THEN** the tip is centered on the hovered cell instead of snapping

### Requirement: Brush presets

The editor SHALL offer built-in brushes and let the user save, rename, overwrite, apply and
delete named brush presets, persisted locally (IndexedDB with in-memory fallback). The `[` and
`]` keys SHALL shrink and grow the brush size.

#### Scenario: Save and reuse a brush

- **WHEN** the user saves the current brush as "Chunky round" and later clicks its preset row
- **THEN** the brush size and tip pattern are restored exactly

### Requirement: Pencil and eraser

The editor SHALL provide a pencil tool that stamps the current brush in the active color and an
eraser tool that clears the same footprint; both SHALL apply while dragging, and each stroke
SHALL commit as a single undo step on pointer release.

#### Scenario: Paint a stroke

- **WHEN** the user presses the pointer and drags across five cells with the pencil
- **THEN** all five cells hold the active color and undo reverts all five at once

#### Scenario: Eraser clears connectors

- **WHEN** the eraser is used on a position within a connector's hit distance
- **THEN** that connector is removed

### Requirement: Flood fill and eyedropper

The editor SHALL provide a flood fill tool that replaces the connected region of identical cell
values under the pointer with the active color, and an eyedropper that sets the active color from
the hovered painted cell. Flood fill SHALL run from every symmetry copy of the clicked seed;
the eyedropper SHALL ignore symmetry.

#### Scenario: Fill an enclosed region

- **WHEN** flood fill is used inside a closed outline
- **THEN** only cells connected to the start cell adopt the new color

### Requirement: Shape tools

The editor SHALL provide line, rectangle, and ellipse tools with live drag preview; the preview
SHALL render with the current style settings, and releasing the pointer SHALL commit the stamped
shape (through the active symmetry mapping, with the brush tip stroked along the outline) as one
undo step.

The editor SHALL additionally provide drag-drawn outline tools for: star (ray count, inner
radius and rotation configurable), regular polygon (side count and rotation configurable),
diamond (rotation configurable), heart (rotation configurable), spiral (turns, winding
direction and rotation configurable), arrow (head length and width configurable), lightning
(rotation configurable), crescent moon (thickness and rotation configurable), wave (period
count and amplitude configurable), cross (arm width and rotation configurable), flower (petal
count and rotation configurable), and gear (tooth count, tooth height and rotation
configurable). Arrow and wave SHALL follow the drag direction (start point to end point); the
rest SHALL fill the drag's bounding box. Every shape tool SHALL support the live drag preview,
symmetry mapping, brush tip stroking and single-step undo, and SHALL rasterize on square,
hex, triangle and radial grids.

#### Scenario: Draw a line with live preview

- **WHEN** the user drags from cell A to cell B with the line tool
- **THEN** the viewport shows the styled line following the pointer before commit

#### Scenario: Thick shapes

- **WHEN** a size-4 brush is active and the user draws a rectangle
- **THEN** the rectangle outline is stroked with the 4×4 tip along its path

#### Scenario: Star with custom ray count

- **WHEN** the star rays slider is set to 8 and the user drags a star
- **THEN** the committed outline is an eight-pointed star inside the dragged box

#### Scenario: Arrow follows the drag

- **WHEN** the user drags the arrow tool from right to left
- **THEN** the arrowhead points at the drag end (left), not at the box edge

### Requirement: Connector tool

The editor SHALL provide a connector tool: a first click sets the start cell, a second click on a
different cell commits a thick rounded trace between the two cell centers plus its symmetry
copies (both endpoints mapped by the same copy), and connectors SHALL render as capsules in both
preview and export and participate in the metaball field.

#### Scenario: Connect two cells

- **WHEN** the user clicks cell A then cell D with the connector tool
- **THEN** a rounded capsule of the active color and configured width joins the centers of A and D

### Requirement: Hover brush indicator

While the pointer is over the canvas, the editor SHALL render a clearly visible brush indicator
covering the exact cells a click would stamp (the tip footprint at its snapped or free anchor):
a translucent fill previewing the paint (active color for painting tools, neutral for the eraser,
none for the eyedropper) plus a screen-constant outline drawn as a bright core over a dark halo
so it reads on any cell color or theme. With symmetry active, the other copies SHALL be previewed
as translucent ghosts.

#### Scenario: Hover feedback on a busy background

- **WHEN** the pointer rests on a cell painted with the same color as the active color
- **THEN** the cell is still distinguishable via the outlined brush indicator

#### Scenario: Mirror ghosts

- **WHEN** 4-way symmetry is on and the pointer hovers with the pencil
- **THEN** the three mirror copies are shown as translucent ghost cells

### Requirement: Tool rail layout

The toolbar SHALL render as one flat list of every tool, without grouping. In the expanded
state each row SHALL show the tool icon and its name, and the list SHALL show a vertical
scrollbar when it overflows the viewport height. In the collapsed state only the icons SHALL
be shown. The chosen state SHALL persist across sessions.

#### Scenario: Expanded shows names

- **WHEN** the toolbar is expanded
- **THEN** every tool row shows its icon and localized name

#### Scenario: Overflow scrolls

- **WHEN** the tool list is taller than the available height
- **THEN** the list scrolls with a visible vertical scrollbar

### Requirement: Per-tool options

Double-clicking a tool in the toolbar SHALL open that tool's settings panel next to the rail;
changes SHALL apply immediately to subsequent drags. Paint tools (pencil, eraser, line,
rectangle, ellipse) SHALL expose their stroke thickness (the brush pixel size), the connector
SHALL expose its width, shape tools SHALL expose the geometry options listed in the shape
tools requirement, and tools without parameters SHALL say so. Esc, the close button or a click
outside the panel SHALL close it.

#### Scenario: Gear options

- **WHEN** the user double-clicks the gear tool, sets 12 teeth and a 30° rotation
- **THEN** the next gear drag draws a 12-tooth gear rotated by 30°

### Requirement: Tool shortcuts

The editor SHALL activate tools via single-key shortcuts: pencil B, eraser E, fill G, eyedropper I,
line L, rectangle R, ellipse O, connector C, star S, polygon N, diamond D, heart H, spiral Q,
arrow A, lightning K, moon M, wave W, cross X, flower J, gear U.

#### Scenario: Switch tool by key

- **WHEN** the user presses E while the pencil is active
- **THEN** the eraser becomes the active tool

#### Scenario: Shape shortcut selects inside the group

- **WHEN** the shapes group is collapsed and the user presses H
- **THEN** the heart tool becomes active and the group header shows the heart icon
