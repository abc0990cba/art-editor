# Proposal: add-metaball-diffusion-controls

## Why

Metaball mode merges painted cells through a scalar field, but the field's shape is fixed: the
merge threshold is hardcoded at 0.5, the kernel falloff is hardcoded cubic, and quality tops out
at the UI's "high" (6) even though the engine accepts up to 8. Users cannot tune how aggressively
neighbors fuse, and — because the result only appears in the artwork — they cannot see *where*
the field is about to cross the threshold while painting. Diffusion is guesswork: paint a cell,
rebuild, and hope. The editor needs visible diffusion aids (contour preview, fine sub-grid,
kernel extent) plus the two missing field controls (threshold, falloff).

## What Changes

- **Merge threshold** — `Doc.metaball.iso` (0.2–0.8, default 0.5) replaces the hardcoded
  `ISO = 0.5` constant in both contour tracers. Lower values fatten blobs (ink spreads further),
  higher values shrink them. Slider in the metaball style group.
- **Falloff curve** — `Doc.metaball.falloff: 'smooth' | 'soft' | 'tight'` (default `smooth`)
  selects the kernel power (cubic `t³`, quadratic `t²`, linear `t`). Chips in the metaball style
  group; `soft` widens the influence skirt, `tight` concentrates fusion near cell centers.
- **Field quality "Ultra"** — the quality chip row gains level 8 (the engine and preset
  normalizer already accept 2–8).
- **Unified field builder** — the duplicated splat/capsule/border code of the square path
  (`geometry-metaball.ts`) and the non-square path (`grid-geometry.ts` `gridMetaball`) is
  extracted into one `engine/metaball-field.ts` used by both; the non-square path gains
  threshold, falloff and per-color link filtering (today it splats *all* links into every
  color's field), matching square behavior.
- **Diffusion guides overlay** — a single "Diffusion guides" toggle (available while metaball
  mode is active, default off) renders three non-exporting canvas aids:
  - a **threshold contour**: the iso-line of the current field drawn as a dashed accent line,
    so the fused blob outline is visible before/while painting;
  - a **half-cell grid**: lines between cells at half the cell pitch (square grid), exposing
    the granularity at which kernels overlap;
  - a **kernel-radius ring**: a circle of the effective kernel radius at the cursor while a
    paint tool hovers, showing exactly which neighbors the next cell will fuse with.
- **Overlay preferences persist** — `showGrid` and `gridEmphasis` (currently session-only) are
  saved with the workspace and restored on reload, together with the new diffusion toggle.

## Capabilities

### Modified

- `metaball-rendering`: the merge-mode requirement gains the threshold and falloff controls;
  the field-quality requirement gains the ultra level; a new diffusion-guides requirement
  covers the contour preview, half-cell grid and kernel ring as non-exporting overlays.
- `canvas-grid`: the canvas-overlays requirement gains the diffusion guides and persistence of
  overlay preferences across reloads.

## Non-Goals

- Negative (repeller) cells carving holes into the field.
- Dilate/erode or blur/threshold effects on the cell buffer.
- Ghost contours at intermediate iso levels; editable contour/grid line colors.
- Half-cell guides on non-square grids (no sub-pitch concept there).
- Per-link fusion width; metaball changes on export formats.
