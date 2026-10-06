# Proposal: add-cell-fields

## Why

Per-cell variation today is limited to a single noise field (`sizeJitter`/`angleJitter`) —
organic scatter, but nothing directed. The staple looks of generative grid art — a funnel
(cells shrink toward the edges), sunburst ripples, wave gradients, checker size rhythm,
vortex swirls, Truchet tilings — all need a *position-driven* field that modulates cell size,
rotation and in-cell offset across the grid. No pixel editor in this space ships these as
live, styleable document parameters; they demand scripted export or one-shot filters.

## What Changes

- New `FieldSettings` block on `PixelStyle` (`doc.style.field`) with three independent
  modulators:
  - **Size field** — `funnel` (radial falloff), `fountain` (inverse), `dome` (diamond
    gradient), `edges` (border-high), `rampX`, `rampY`, `rampDiag`, `waveX`, `waveY`,
    `rings` (radial waves), `spiral`, `checker`; strength (`amount` 0–100%), floor
    (`min` scale), direction `angle`, wavelength `period`, `phase`, `invert`.
  - **Align field (rotation)** — `center` (face the center), `outward`, `swirl` (tangent),
    `truchet` (seeded 90° steps → emergent quarter-circle patterns), `wave` (sine swing).
  - **Offset field (in-cell displacement)** — `vortex` (tangential drift), `magnet`
    (radial pull), `drift` (directional sine), `scatter` (seeded jitter).
- Pure evaluators in `engine/effects/fields.ts` (deterministic per cell, like jitter),
  consumed in the square-grid per-cell path and the non-square-grid path; the inlay and
  every existing per-cell knob (tone sizing, stretch, spread) compose with the field.
- Fast-path gates extended: any active field leaves the run-merge path; rotation/offset
  fields leave the plain-rect path; baked texture stays a no-size-field feature.
- UI: a "Field" group in the Style section (pixels mode): kind chips per modulator +
  strength/min/angle/period/phase sliders, invert toggle, seed randomize.
- Plumbing: style key/equality, project round-trip, preset normalization, a `style.field`
  node, built-in presets (Funnel, Vortex, Ripple, Truchet Weave…). i18n en+ru.

## Capabilities

### Modified

- `pixel-styling` — ADDED requirements: grid-wide cell fields (size/align/offset modulators
  with deterministic per-cell evaluation and fast-path preservation); field controls.

## Non-Goals

- Fields in outline/metaball/contour/extrude modes (pixels mode only, like inlays).
- Per-cell color effects from the field (recolor stays with fill patterns / dithering).
- Truchet-specific quarter-circle tile geometry (the 90° step rotation + any form achieves it).
