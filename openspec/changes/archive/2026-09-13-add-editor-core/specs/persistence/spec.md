# persistence — Delta

## ADDED Requirements

### Requirement: Autosave

The editor SHALL debounce-save the document to localStorage after edits stop (about one second) and
SHALL restore it on the next launch.

#### Scenario: Survives reload

- **WHEN** the user paints, closes the tab, and reopens the editor
- **THEN** the painted cells reappear

### Requirement: Reset

The editor SHALL offer a clear action that empties all cells and connectors and is undoable.

#### Scenario: Clear then undo

- **WHEN** the user clears the canvas and immediately undoes
- **THEN** the previous content is restored
