# i18n Specification

## Purpose
TBD - created by archiving change add-editor-core. Update Purpose after archive.

## Requirements

### Requirement: Interface languages

The editor UI SHALL be available in English (default) and Russian, switchable at runtime from the
top bar, with the choice persisted.

#### Scenario: Switch to Russian

- **WHEN** the user selects Russian in the top bar
- **THEN** all panel labels, tool tooltips and dialogs render in Russian without reload

#### Scenario: Persisted choice

- **WHEN** the language is set to Russian and the app is reloaded
- **THEN** the UI remains in Russian

### Requirement: Theme switcher labels

The theme switcher (Dark / Light / Auto) SHALL have EN and RU labels like every other control.

#### Scenario: Russian labels

- **WHEN** the UI language is Russian
- **THEN** the theme control reads «Тёмная / Светлая / Авто»
