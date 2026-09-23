# Proposal: add-project-library

## Why

The editor currently persists exactly one document: an autosave slot in localStorage plus manual
JSON file export. Users have no way to keep multiple works in progress — switching between
drawings requires exporting/importing files manually. A project library stored in the browser
makes the editor usable for several artworks at once.

## What Changes

- Add an IndexedDB-backed project library (`glyph-editor` database, `projects` store) with a
  graceful in-memory fallback when IndexedDB is unavailable.
- Each project entry stores: id, name, created/updated timestamps, a rendered PNG thumbnail
  (data URL, longest side ≈ 320px) and the serialized document.
- Add a **Projects** gallery dialog (top bar button): save the current document under a name,
  browse cards with thumbnails and update dates, open, duplicate, rename (inline) and delete
  (inline confirm), plus "New project" (reset to a fresh default document).
- Guard against accidental loss: opening a project or creating a new one when the canvas has
  painted cells asks for inline confirmation before replacing the canvas.
- The autosave of the current canvas and the JSON file export/import remain unchanged.
- New store action `newDoc` (reset to the default document); project library state is managed
  inside the dialog (not in the undoable document slice).

## Capabilities

### Modified

- New capability `project-library` — ADDED requirements for storage, the gallery dialog and
  canvas-replacement guards.

## Non-Goals

- Cloud sync, sharing, project folders/tags
- Import/export of library projects as files (JSON file export stays in the Export section)
- Undo history spanning project switches
