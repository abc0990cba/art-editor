# persistence — Delta

## ADDED Requirements

### Requirement: Project schema v2 with element styles

Saved projects and autosave SHALL serialize the style scope, the element style table, and a run-length-encoded per-cell element-id buffer parallel to the cells; connectors SHALL carry their element id. Schema version SHALL bump to 2.

#### Scenario: Round-trip

- **WHEN** a document with several differently-styled elements is saved and loaded
- **THEN** every element's cells, frozen styles and connectors come back identical, including the selection-relevant element structure.

### Requirement: v1 migration

Opening a version-1 project (or an autosave without element data) SHALL produce a document in `global` scope with an empty element table; the rendered picture SHALL be identical to before.

#### Scenario: Old file opens unchanged

- **WHEN** the user loads a v1 project file
- **THEN** the artwork renders exactly as it did before the update and the style panel behaves in global mode.

### Requirement: Compact cellObj encoding

The element-id buffer SHALL be stored as `[id, runLength, …]` pairs so blank canvases and single-element documents add negligible size; an empty buffer serializes as an empty array.

#### Scenario: Blank canvas stays small

- **WHEN** a blank canvas is saved
- **THEN** the serialized element buffer is an empty array rather than one entry per cell.
