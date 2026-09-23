# pixel-styling — Delta

## ADDED Requirements

### Requirement: Element style scope

The pixel style panel SHALL provide a two-way style-scope switch: `element` and `global`. The scope SHALL be part of the document and persist in saved projects. New documents SHALL default to `element` scope; documents saved by older versions SHALL load in `global` scope.

#### Scenario: Global scope keeps today's behavior

- **WHEN** the scope is `global`
- **THEN** the style, render mode, connectivity, metaball and texture settings apply to every painted cell on the canvas exactly as before per-element styles existed.

#### Scenario: Switching to element scope preserves the picture

- **WHEN** the user switches from `global` to `element` scope on a canvas with artwork
- **THEN** all painted cells (and connectors) are attributed to a single new element carrying a snapshot of the current global style, and the rendered picture does not change.

#### Scenario: Switching scope is lossless

- **WHEN** the user switches `element` → `global` → `element`
- **THEN** previously frozen per-element styles still exist and render again after switching back; the change is a single undoable document action.

### Requirement: Stroke style freezing

In `element` scope, every drawing action (pencil/eraser strokes, shape tools, flood fill, connectors) SHALL freeze a snapshot of the current drawing style — pixel style, render mode, connectivity, metaball settings and texture — into the cells it painted. Later changes to the style panel SHALL NOT affect already-drawn elements; they only affect the style of future strokes.

#### Scenario: Old strokes keep their look

- **WHEN** the user draws a stroke, changes the corner radius in the panel, and draws a second stroke
- **THEN** the first stroke renders with the radius it was drawn with and the second stroke renders with the new radius.

#### Scenario: Fill and connectors freeze style too

- **WHEN** the user flood-fills a region or places a connector in element scope
- **THEN** the filled cells and the connector join the same frozen-style element model as brush strokes.

### Requirement: Merging elements with identical styles

In `element` scope, cells of different elements whose frozen styles are equal SHALL render as one group: metaball blobs merge across them, outline traces one shared silhouette, and texture flows continuously. Elements remain separately selectable regardless of merging.

#### Scenario: One blob from many strokes

- **WHEN** the user paints several adjacent strokes with metaball style S without changing settings between them
- **THEN** the strokes render as one merged blob field, identical to a global-scope metaball rendering of the same cells.

### Requirement: Selection-targeted style editing

In `element` scope with a non-empty selection, the Style and Texture panel sections SHALL show the selected elements' current values and every change SHALL restyle only the selected elements (copy-on-element, one undo step per committed change). Other elements and the drawing style SHALL be unaffected. Without a selection, the sections edit the drawing style used by the next strokes.

#### Scenario: Restyle one line

- **WHEN** the user selects one drawn line and moves the metaball strength slider
- **THEN** only that line's blobs change; other artwork and the drawing style stay as they were.

#### Scenario: Panel shows the element's values

- **WHEN** an element drawn with radius 0.1 is selected while the drawing style has radius 0.4
- **THEN** the radius slider shows 0.1 until the selection is dismissed.
