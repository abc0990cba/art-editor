# Proposal: add-editor-presets

## Why

The editor exposes a rich set of tunable parameters — grid type and size, sub-cell detail,
palette, render mode, pixel style, metaball settings, connectivity, background, connector width
and symmetry. Retyping a beloved combination by hand is tedious and error-prone. Named presets
turn a configuration into a one-click starting point, and a small curated set of built-ins gives
new users instantly beautiful results.

## What Changes

- Add **editor presets**: a named snapshot of every user-changeable editor parameter — grid type,
  canvas size, sub-cells, palette, render mode, pixel style, metaball settings, connectivity,
  background, connector width and symmetry — excluding painted content (cells, links).
- Ship **8 read-only built-in presets** tuned for attractive output (Neon Metaballs, Game Boy,
  Bubblegum, Blueprint, Kaleido Bloom, Retro Chamfer, Mandala, Sticker Pop).
- Persist user presets in IndexedDB (database `glyph-editor`, new `presets` store, schema version
  bumped to 2, shared DB opener for both stores) with the same graceful in-memory fallback as the
  project library.
- Apply is a single **undoable** document transition: grid/type/size changes preserve artwork via
  the existing cell-sampling conversion path, palette swaps recolor values in place; the symmetry
  state (not undoable) is updated alongside, consistent with current behavior.
- **Presets** section in the settings panel: one-click apply with active-preset highlighting and
  a Manage button.
- **Presets dialog**: save the current settings under a name, list all presets (built-ins first,
  badged) with generated style previews, apply, and full CRUD for user presets — duplicate,
  overwrite with current settings, inline rename, delete with inline confirm. Built-ins are
  immutable; duplicating one creates an editable copy.
- Preview thumbnails are generated on the fly by rendering a procedural sample artwork through
  the preset's configuration (no thumbnails stored).
- All strings localized (EN/RU).

## Capabilities

### Added

- New capability `editor-presets` — preset config scope, built-in set, apply semantics, storage,
  and the panel section + manage dialog.

## Non-Goals

- Import/export of presets as files
- Editing built-in presets in place (duplicate instead)
- Storing preview thumbnails in the database (generated on demand)
- Presets capturing painted content — that is the project library's job
