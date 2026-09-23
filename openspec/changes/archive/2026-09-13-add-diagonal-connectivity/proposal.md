# Proposal: add-diagonal-connectivity

## Why

Corner-touching (diagonal) cells currently never join: outline mode traces them as separate
silhouettes and metaball mode merges diagonals only at high strength. For glyph-style drawing,
diagonal strokes are common, and the way two diagonal cells join at their shared corner is a
styling decision. The editor needs explicit connectivity modes that define how diagonal
neighborhoods render in the outline and metaball modes.

## What Changes

- Add a document setting `connectivity` with three values:
  - `edge` (default, current behavior) — only edge-adjacent cells merge.
  - `corner` — same-color cells touching at a corner join through that point: in outline mode the
    binary saddle resolves as connected (the silhouette pinches through the shared corner, and
    the existing corner fillets turn the pinch into a smooth neck); in metaball mode a kernel is
    added at each diagonal junction so blobs merge there at any strength.
  - `corner-bridge` — corner connection as above, plus a rounded square "bridge" overlay centered
    on the shared corner (size proportional to the cell), so the junction reads as a solid joint
    instead of a pinch.
- The setting applies to outline and metaball render modes; pixels mode is unaffected. It is
  part of the document, participates in undo and is stored in saved projects.
- UI: a three-way segmented control in the pixel style panel, visible in outline and metaball
  modes; EN/RU labels.

## Capabilities

### Modified

- `pixel-styling` — ADDED requirement: diagonal connectivity modes governing how corner-touching
  cells join in outline and metaball rendering.

## Non-Goals

- Applying connectivity to flood fill (fill stays 4-connected)
- Per-cell manual connection overrides
- Changing metaball strength semantics
