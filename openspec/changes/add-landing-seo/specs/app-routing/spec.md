# app-routing — Delta

## MODIFIED Requirements

### Requirement: URL routes as app surfaces

The editor SHALL use URL routes as the source of truth for the visible surface under the base
path `/editor`: `/editor` SHALL render the home screen; `/editor/p/$projectId` SHALL render the
editor whose workspace (pixel or vector) is derived from the opened project's kind. Workspace
selection SHALL NOT depend on a global mode preference. The site root `/` SHALL be the public
landing page (see the `landing-page` capability), not an app surface.

#### Scenario: Route decides the surface

- **WHEN** the user opens `/editor/p/<id>` of a vector project
- **THEN** the vector workspace is shown regardless of any previously stored mode

#### Scenario: Root is the landing

- **WHEN** the user opens `/`
- **THEN** the static landing page is shown, not the app

### Requirement: Hosting rewrite parity

The `/editor` and `/editor/*` paths SHALL serve the editor page in development, preview and
production hosting alike, so deep links work identically in every environment.

#### Scenario: Deep link in production

- **WHEN** the user opens `/editor/p/<id>` on a statically hosted deployment
- **THEN** the hosting rewrite serves the editor page and the router opens that project
