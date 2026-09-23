# theming Specification

## Purpose
TBD - created by archiving change add-light-theme. Update Purpose after archive.

## Requirements

### Requirement: Semantic theming of UI and canvas

The editor UI SHALL use semantic color tokens (CSS custom properties mapped to Tailwind
utilities) instead of hardcoded dark colors, and the canvas overlays (checkerboard, grid,
sub-grid, symmetry guides, hover highlight, canvas border) SHALL pick colors from a theme object
matching the resolved theme, so the whole editor renders correctly in dark and light themes.

#### Scenario: Light theme legibility

- **WHEN** the light theme is active
- **THEN** panels, text, chips, tool rail and canvas overlays are readable (no dark-only colors
  remain visible)

### Requirement: Theme preference

The editor SHALL offer a theme preference — Dark, Light, Auto — persisted across reloads;
`Auto` SHALL follow `prefers-color-scheme` reactively; the resolved theme SHALL be applied as a
`data-theme` attribute on the document root and drive both CSS and canvas colors.

#### Scenario: Persisted light preference

- **WHEN** the user selects Light and reloads the page
- **THEN** the editor boots in the light theme

#### Scenario: Auto follows the system

- **WHEN** the preference is Auto and the operating system switches its color scheme
- **THEN** the editor theme follows the system switch without reload
