# drawing-tools — Delta

## ADDED Requirements

### Requirement: Select tool

The tool rail SHALL offer a Select tool (single-key shortcut `V`). Clicking a painted cell selects the element that owns it; Shift+click toggles a cell's element in/out of the multi-selection; clicking empty canvas, pressing Escape, or switching to another tool clears the selection; Ctrl/Cmd+A selects all elements. The current selection SHALL be highlighted on the canvas overlay (tint plus silhouette contour) and elements under the cursor SHALL show a hover affordance.

#### Scenario: Pick one element

- **WHEN** the user clicks a cell of a stroke drawn earlier while using the Select tool
- **THEN** every cell of that stroke's element is highlighted and the style panel targets it.

#### Scenario: Multi-select and clear

- **WHEN** the user Shift+clicks a second element and then presses Escape
- **THEN** both elements are selected together, and afterwards the selection is empty.

### Requirement: Delete selection

Pressing Delete or Backspace with a non-empty selection SHALL erase all cells of the selected elements (and their connectors) as one undoable action.

#### Scenario: Erase a drawn line

- **WHEN** the user selects a line and presses Delete, then undoes
- **THEN** the line disappears and undo restores it with its original style.

### Requirement: Drag-move selection

On the square grid, dragging the selection with the Select tool SHALL move the selected elements' cells, colors, connectors and style attribution by the dragged offset as one undoable action, overwriting whatever was under the destination. Content moved past the canvas edge SHALL be clipped. A live ghost preview SHALL follow the pointer during the drag. On non-square grids dragging SHALL be disabled while selection, restyle and delete keep working.

#### Scenario: Move an element

- **WHEN** the user drags a selected element 5 cells right and releases, then undoes
- **THEN** the element (cells, colors, style) reappears 5 cells right, overwriting the area under it, and undo restores the previous state exactly.

#### Scenario: Live preview during drag

- **WHEN** the user is dragging a selection
- **THEN** the canvas shows the element at the offset position with its own frozen style before the pointer is released.
