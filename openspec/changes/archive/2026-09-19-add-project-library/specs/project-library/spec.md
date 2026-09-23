# project-library — Delta

## ADDED Requirements

### Requirement: Project storage

The editor SHALL persist named projects in IndexedDB (database `glyph-editor`, store `projects`,
indexed by update time), each entry containing a unique id, name, creation and update timestamps,
a PNG thumbnail (data URL, longest side ≈ 320px) and the serialized document. When IndexedDB is
unavailable the library SHALL degrade to an in-memory store with the same API.

#### Scenario: Project survives reload

- **WHEN** the user saves a project and reloads the editor
- **THEN** the project appears in the library with its thumbnail, name and document intact

### Requirement: Gallery dialog

The editor SHALL provide a Projects dialog (opened from the top bar) that lists library projects
as cards (thumbnail, editable name, update date) with actions open, duplicate, rename and delete
(deletion requires an inline confirmation), and SHALL allow saving the current canvas under a
user-provided name.

#### Scenario: Save, duplicate, rename, delete

- **WHEN** the user saves the current canvas as "Sketch", duplicates it, renames the copy and
  deletes the original
- **THEN** the library contains exactly "Sketch copy" with the same artwork

#### Scenario: Open restores the canvas

- **WHEN** the user opens a library project
- **THEN** the canvas, palette, style and grid settings match the saved state

### Requirement: Canvas replacement guard

Opening a library project or starting a new project SHALL replace the current canvas; when the
current canvas has painted cells the editor SHALL require an inline confirmation first.

#### Scenario: Confirm before replacing

- **WHEN** the canvas has painted cells and the user opens a library project
- **THEN** a confirmation prompt is shown and the canvas is replaced only after confirming
