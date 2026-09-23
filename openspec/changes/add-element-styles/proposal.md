# Proposal: add-element-styles

## Why

Pixel styles (corner rounding, render mode, connectivity, metaball, texture) are document-global: changing any slider retroactively re-styles every painted cell on the canvas. Users draw with one look, adjust the settings, and the artwork they already drew changes under them. The editor is promoted as a vector tool, yet nothing drawn can be selected or edited after the fact.

Styles should stick to what was drawn: a stroke painted with a rounding/metaball setting keeps that look, and later setting changes affect only future strokes. Already-drawn elements should be selectable and re-stylable from the same right-hand panel, like vector objects.

## What Changes

- **Element styles**: every stroke, shape, fill and connector freezes a full style snapshot (pixel style, render mode, connectivity, metaball, texture) at draw time. A per-cell element-id buffer (`cellObj`) plus an `elements: ElementStyle[]` table store the attribution.
- **Style scope toggle**: the pixel style panel gains a two-way switch — `element` (per-stroke frozen styles, default for new documents) and `global` (today's behavior: the panel re-styles the whole canvas live). Switching element→global→element is lossless; entering element mode materializes all existing art into one element so the picture does not change.
- **Merging by style**: neighboring strokes painted with identical styles render as one group (metaball blobs merge, outline has no internal silhouettes), while remaining separately selectable.
- **Select tool** (hotkey `V`): click selects the element under the cursor, Shift+click adds/removes, click on empty space or Esc deselects, Ctrl/Cmd+A selects all, Delete erases the selection. Selected elements can be **dragged** to a new position (square grid), carrying their cells, colors, connectors and style.
- **Context-aware settings panel**: with a selection active in element mode, the Style and Texture sections target the selected elements — sliders show the element's values and edits restyle only the selection (undoable). Without a selection they edit the drawing style used by the next strokes (or the whole canvas in global mode).
- **Persistence v2**: projects and autosave serialize `styleScope`, `elements` and an RLE-compressed `cellObj`; connectors carry their element id. v1 files migrate to global scope and render identically.

## Capabilities

### Added

- `drawing-tools`: Select tool (pick, multi-select, drag-move, delete) — new requirements in the existing capability.

### Modified

- `pixel-styling`: per-element frozen styles, style scope toggle, context-aware style panel.
- `metaball-rendering`: metaball fields (and outline silhouettes) computed per style group in element scope.
- `persistence`: project schema v2 with elements, cellObj (RLE) and connector element ids; v1 migration.

## Non-Goals

- Drag-move on hex/triangle/radial grids (selection, restyle and delete work everywhere; move is square-grid only in v1).
- Styles stored inside brush presets; the drawing style stays a panel-level setting.
- Marquee selection, snapping guides, scale/rotate transforms of elements.
- Per-element palette, background, connector width or grid settings.
