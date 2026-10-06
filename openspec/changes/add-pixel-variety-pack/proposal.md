# Proposal: add-pixel-variety-pack

## Why

The pixel-style expansion ships inner figures (add-cell-inlays), grid fields
(add-cell-fields) and glyph matrices (add-glyph-inlays). The remaining variety gaps: cells
can only render as filled silhouettes (no outline/hollow look), the silhouette catalog lacks
several staple forms (the Truchet quarter disc, eye, bowtie, hourglass, keyhole, skewed bar,
wave band), and none of the new systems have one-click built-in looks beyond a first batch.

## What Changes

- **Hollow cells**: new `PixelStyle.stroke` block — figures render as outlines (stroke) with
  a width knob, a derived color mode (same / darker / lighter) and a fill on/off toggle.
  Both canvas and SVG export already render stroked paths (connectors use them); pixels mode
  emits the same per-color path data with stroke attributes. The inner-figure inlay stays
  filled.
- **Seven new cell forms** via the standard five-point registration: `quadrant` (corner
  quarter disc — the classic Truchet tile), `bowtie`, `hourglass`, `keyhole`, `eye`
  (lens with an iris hole), `parallelogram`, `waveStrip` (horizontal sine band).
- **Preset batch**: Blueprint (hollow squares), Contour Dots (hollow circles), Waveband,
  Keyholes, Eyes, Bowties — one `PresetSeed` row each.

## Capabilities

### Modified

- `pixel-styling` — ADDED requirements: hollow-cell stroke style; ADDED forms to the cell
  form registry requirement surface (picker, rendering, exports).

## Non-Goals

- Per-cell shape ramps / confetti (shape variation across the grid) — deferred: the ordered
  list editor deserves its own design pass; not silently dropped, tracked as a follow-up.
- Stroke styling for outline/metaball/contour/extrude render modes.
- Per-side stroke widths.
