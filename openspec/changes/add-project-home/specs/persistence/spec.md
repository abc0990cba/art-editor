# persistence — Delta

## MODIFIED Requirements

### Requirement: Autosave

While a project is open the editor SHALL debounce-write changes into that project's library entry
(about two seconds after edits stop): pixel documents as the serialized document, vector projects
as the trace session (source bitmap, params, SVG, stats) at its own throttled write rate. A
localStorage mirror of the pixel document SHALL remain as the instant-boot cache. Pending writes
SHALL be flushed when the page is hidden or closed. The editor SHALL offer a clear action that
empties all cells and connectors and is undoable.

#### Scenario: Survives reload inside a project

- **WHEN** the user paints, waits past the autosave window, reloads the page
- **THEN** the same project reopens (via its URL) with the painted cells present

#### Scenario: Survives tab close without waiting

- **WHEN** the user paints and immediately closes the tab
- **THEN** the flushed write keeps the loss window at zero for closed pages

#### Scenario: Vector session persists

- **WHEN** the user imports an image, adjusts trace params and closes the tab
- **THEN** reopening the vector project restores the source, params and last SVG
