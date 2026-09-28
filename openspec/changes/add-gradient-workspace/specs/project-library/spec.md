# project-library — Delta

## MODIFIED Requirements

### Requirement: Project storage

The editor SHALL persist named projects in IndexedDB (database `glyph-editor`, store `projects`,
indexed by update time). Every entry SHALL carry a `kind` discriminator: `'pixel'` entries contain
the serialized pixel document, `'vector'` entries the trace session, `'gradient'` entries the
gradient session (source bitmap, gradient params, resulting SVG, gradient stats). All entries
contain a unique id, name, creation and update timestamps and a thumbnail. Records without a kind
SHALL upgrade to `'pixel'` on read. When IndexedDB is unavailable the library SHALL degrade to an
in-memory store with the same API.

#### Scenario: Gradient project survives reload

- **WHEN** the user opens a gradient project, imports an image and reloads the page
- **THEN** the project reopens into the gradient workspace with source, params and the last fitted
  SVG restored (the runtime error heatmap may be empty until the next fit)

#### Scenario: Creating a gradient project

- **WHEN** the user picks "Gradient" in the new-project dialog and names it
- **THEN** a `kind: 'gradient'` library entry is created and the route opens the gradient
  workspace with an import surface
