# import-image — Delta

## ADDED Requirements

### Requirement: Declarative dither catalog

The system SHALL declare every import dither id exactly once in an engine catalog with
its strategy family (off, ordered, diffusion, special, glyph), and SHALL derive the
pipeline dispatch, the ordered-threshold slider visibility, the dialog's grouped select
and the visual gallery from that catalog. Adding an algorithm SHALL NOT require editing
the dialog's group lists.

#### Scenario: Gallery follows the catalog

- **WHEN** a dither id is added to the catalog with a family and an implementation
- **THEN** the dialog select and the visual gallery list it under its family group
  without further UI changes

#### Scenario: Unknown strategy falls back

- **WHEN** the selected dither id has no registered implementation for its family
- **THEN** the conversion falls back to nearest-color mapping instead of failing
