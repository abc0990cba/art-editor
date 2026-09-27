# project-library — Delta

## MODIFIED Requirements

### Requirement: Project storage

The editor SHALL persist named projects in IndexedDB (database `glyph-editor`, store `projects`,
indexed by update time). Every entry SHALL carry a `kind` discriminator: `'pixel'` entries contain
the serialized pixel document, `'vector'` entries contain the trace session (source bitmap, trace
params, resulting SVG, trace stats). All entries contain a unique id, name, creation and update
timestamps and a PNG thumbnail (data URL). Records written before the kind field existed SHALL be
upgraded to `'pixel'` on read and by a one-time store migration. When IndexedDB is unavailable the
library SHALL degrade to an in-memory store with the same API.

#### Scenario: Project survives reload

- **WHEN** the user saves a project and reloads the editor
- **THEN** the project appears in the library with its thumbnail, name and document intact

#### Scenario: Legacy entries become pixel projects

- **WHEN** the app opens a library written by a version without project kinds
- **THEN** all existing entries are readable as pixel projects without data loss

## ADDED Requirements

### Requirement: Home screen

The editor SHALL provide a home surface as the start view of the app. It SHALL show a "Continue"
card for the most recently opened project (live thumbnail, name) and a grid of library cards
(thumbnail, type badge, canvas size for pixel projects, update date) sorted by update time. Each
card SHALL offer open, rename, duplicate and delete; deletion SHALL require an inline confirmation.

#### Scenario: Continue where you left off

- **WHEN** the user closes the tab with a project open and later opens the app root
- **THEN** the home surface shows that project as the Continue card and opening it restores the
  workspace with the project's kind

#### Scenario: Duplicate, rename, delete from home

- **WHEN** the user duplicates a card, renames the copy and deletes the original
- **THEN** the library contains exactly the renamed copy with the same artwork

### Requirement: Project creation with type choice

The home surface SHALL offer a single "New project" action that first asks for the project type
(pixel or vector). A pixel project SHALL be configured with name, canvas size and grid type before
creation; a vector project SHALL be created from a name alone and opens with an import surface. A
created project SHALL immediately exist as a library entry and the app SHALL navigate to it.

#### Scenario: Create a pixel project

- **WHEN** the user creates a pixel project 64×64 named "Sprite"
- **THEN** a library entry "Sprite" exists and the pixel workspace opens at 64×64

#### Scenario: Create a vector project

- **WHEN** the user creates a vector project named "Logo trace"
- **THEN** a library entry "Logo trace" exists and the vector workspace opens with an empty import
  surface

## REMOVED Requirements

### Requirement: Gallery dialog

(The modal projects dialog opened from the top bar is superseded by the home screen; its save
action is superseded by ambient autosave.)

### Requirement: Canvas replacement guard

(Opening a project and creating a new project now happen from the home surface, so an open project
is never destructively replaced; the confirmation guard has no remaining scenario.)
