# app-routing Specification

## Purpose

TBD - created by change add-project-home. Update Purpose after archive.

## Requirements

### Requirement: URL routes as app surfaces

The editor SHALL use URL routes as the source of truth for the visible surface: `/` SHALL render the
home screen; `/p/$projectId` SHALL render the editor whose workspace (pixel or vector) is derived
from the opened project's kind. Workspace selection SHALL NOT depend on a global mode preference.

#### Scenario: Route decides the surface

- **WHEN** the user opens `/p/<id>` of a vector project
- **THEN** the vector workspace is shown regardless of any previously stored mode

### Requirement: Reload restores the open project

Reloading the page while a project route is open SHALL reopen that same project; only changes made
within the autosave window may be lost. Closing the tab and opening the app root later SHALL land on
the home screen with the last project offered as Continue.

#### Scenario: Deliberate reload

- **WHEN** the user presses reload while editing a project
- **THEN** the same project and workspace reopen without navigating home

### Requirement: Unknown project falls back home

When a project route references an id that is missing from the library, the app SHALL fall back to
the home screen instead of rendering a broken editor.

#### Scenario: Deleted from another tab

- **WHEN** the user opens a URL of a project that has been deleted
- **THEN** the home screen is shown

### Requirement: View state in search params

View-level editor state (right panel collapsed, node editor visibility, mode and split ratio) SHALL
be stored in typed, optional search parameters validated on read, and SHALL be written with
history-replacement so browser Back/Forward is not polluted. Preferences (theme, language, layout
toggles) SHALL remain in localStorage, not in the URL.

#### Scenario: Reload keeps the panel layout

- **WHEN** the user collapses the right panel and reloads
- **THEN** the panel stays collapsed, restored from the URL

#### Scenario: Invalid params are ignored

- **WHEN** a URL contains `?node=bad` or `?nodeSplit=7`
- **THEN** the defaults apply and the invalid value is not kept in the URL
