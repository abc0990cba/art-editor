# Proposal: add-editor-core

## Why

Users need a minimalist web editor that draws on a pixel grid and exports the result as a clean
vector SVG. Ordinary pixel editors output raster squares only; tools that do export vector do not
offer per-pixel shape customization (variable corner rounding, independent X/Y stretch), a metaball
("liquid merge") render mode, rich symmetry drawing, connectors between cells, or sub-cell detail.
This change establishes the editor core: document model, geometry engine shared by the live canvas
preview and the SVG exporter, drawing tools, styling, metaball rendering, symmetry, connectors,
sub-cells, export/save, and a bilingual (EN/RU) UI.

## What Changes

- Add a Vite + React 19 + TypeScript app shell with a dark, minimal three-pane layout
  (top bar, tool rail, settings panel, canvas viewport).
- Add a pure-TS geometry engine that turns the cell buffer + style settings into SVG path data:
  rounded-rect primitives with uniform and per-corner radii plus independent X/Y stretch, and a
  metaball mode that builds a scalar field (cells + connector capsules) and extracts smooth
  contours via marching squares.
- Add drawing tools: pencil, eraser, flood fill, eyedropper, line, rectangle, ellipse, and a
  connector tool that draws thick rounded traces between cell centers.
- Add symmetry modes: none, vertical mirror, horizontal mirror, 4-way, diagonal 8-way, radial
  N-fold (2–24), kaleidoscope (N-fold + mirror), with visual guides.
- Add sub-cell detail (×1/×2/×3): each pixel cell can be subdivided into sub-cells for finer
  drawing while connectors stay on the pixel grid.
- Add canvas management: resizable grid 1–100 × 1–100, zoom/pan, grid overlay, background color
  or transparency.
- Add export (SVG, PNG 1×–16×), project save/load as JSON, and localStorage autosave.
- Add undo/redo for document edits and a bilingual UI (English default, Russian switch).

## Capabilities

### New

- `canvas-grid` — grid sizing/resize, viewport zoom & pan, overlays (grid lines, guides, checkerboard)
- `drawing-tools` — pencil, eraser, fill, eyedropper, line/rect/ellipse shapes, connector tool
- `pixel-styling` — corner radius (uniform + per-corner), X/Y stretch, shape presets
- `metaball-rendering` — metaball merge mode with strength, per-color isolation, field quality
- `symmetry` — mirror/quad/diagonal/radial/kaleidoscope drawing symmetry with guides
- `sub-cells` — ×1/×2/×3 sub-cell detail per pixel cell
- `export` — SVG vector export, PNG raster export, project JSON save/load
- `persistence` — localStorage autosave and restore
- `i18n` — English/Russian interface language

## Non-Goals

- Animation, frames, layers, onion skinning
- Cloud sync, accounts, collaboration
- Import of images (raster or vector)
- Mobile/touch-optimized layout (desktop pointer only for v1)
