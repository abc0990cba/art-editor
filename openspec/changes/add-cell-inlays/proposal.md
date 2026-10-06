# Proposal: add-cell-inlays

## Why

Cells can only ever render one silhouette. Artists working in the pixel style section have no
way to put a second figure *inside* a pixel — a dot in a circle, a ring in a square, a star in
a diamond — which is a staple look of dot-matrix posters, halftone comics and physical pixel
media (Perler bead cores, cross-stitch Motif centers). Today the only path to that look is the
one-shot `figurefy` selection effect, which rewrites ink at a k×k block scale instead of
decorating each cell, and it cannot be styled, undone per stroke, or kept as a live document
style.

## What Changes

- New `InlaySettings` block on `PixelStyle` (`doc.style.inlay`): optional second figure drawn
  inside every painted cell. It reuses the cell-shape registry (all forms, with their own
  thickness/points/rotation parameters) or `none`; scale 10–90% of the cell figure; offset
  ±50% per axis; own rotation.
- Inlay color: fixed palette slot, cell color darkened, cell color lightened, palette's darkest
  color, palette's lightest color; darken/lighten strength via a depth setting (0–100%).
  Derived colors computed per palette value by a new `engine/color/shade.ts` helper.
- Rendering in pixels mode: the geometry builder emits one extra fragment per cell into
  separate per-color groups painted after the base figure; the inlay box derives from the base
  figure box so it follows tone sizing, X/Y stretch and size/angle spread. Live stroke preview
  (`stagedCellPath`) and non-square grids (`gridPixels`) get the same treatment. The
  run-merge fast path stays intact while the inlay is `none`.
- Style plumbing: `samePixelStyle` and the element-scope style key compare the inlay block;
  project save/load round-trips it; preset normalization clamps it; the `style.pixel` node
  exposes its parameters.
- UI: an "Inner figure" group in the Style section (pixels mode only): enable toggle, shape
  picker, scale/offset sliders, per-form thickness/points, color mode chips, palette slot
  swatches, depth slider. i18n en+ru.
- Built-in style presets demonstrating the feature (e.g. dotted circles, ringed squares).

## Capabilities

### Modified

- `pixel-styling` — ADDED requirements: inner figure inlays (composition, color modes,
  transformation following, persistence and fast-path preservation); inner figure controls
  (Style-section group, pixels-mode visibility, standard style pipeline).

## Non-Goals

- Glyph/emoji inlays (dot-matrix sampled characters) — separate change.
- Grid-wide size/rotation/offset fields (funnel, vortex, waves) — separate change.
- Inlays in outline/metaball/contour/extrude render modes (pixels mode only in v1).
- Inlay-specific corner radii (the inlay follows the cell radius setting).
- Interaction between baked texture holes and the inlay (holes keep punching the base figure;
  the inlay simply paints on top).
