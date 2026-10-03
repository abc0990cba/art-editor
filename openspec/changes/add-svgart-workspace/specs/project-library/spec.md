# project-library — Delta

## MODIFIED Requirements

### Requirement: Project storage

The editor SHALL persist named projects in IndexedDB (database `glyph-editor`, store `projects`,
indexed by update time). Every entry SHALL carry a `kind` discriminator: `'pixel'` entries contain
the serialized pixel document, `'vector'` entries the trace session, `'gradient'` entries the
gradient session (source bitmap, gradient params, resulting SVG, gradient stats), `'svgart'`
entries the authored studio scene. All entries contain a unique id, name, creation and update
timestamps and a thumbnail. Records without a kind SHALL upgrade to `'pixel'` on read. When
IndexedDB is unavailable the library SHALL degrade to an in-memory store with the same API.

#### Scenario: Studio project survives reload

- **WHEN** the user opens an svgart project, edits layers and reloads the page
- **THEN** the project reopens into the studio workspace with the scene restored

#### Scenario: Creating a studio project

- **WHEN** the user picks "SVG Studio" in the new-project dialog, chooses a template and names it
- **THEN** a `kind: 'svgart'` library entry is created and the route opens the studio workspace
  with the template scene loaded
