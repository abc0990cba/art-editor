# Proposal: add-line-systems

## Why

Halftone screens (dots and marks) shipped with `add-halftone-screen-engine`, but the second
half of the engraving/print vocabulary is missing: parallel line systems. Fill patterns only
offer axis-aligned threshold stripes; texture has no line effect; the node graph cannot render
tone as engraved lines. Vexy-style hatching (straight / crossed / waved lines whose width
carries the tone) is the signature look of the vector-art direction and the direct predecessor
of iso-tone contours and plotter output.

## What Changes

- **`src/engine/screen-lines.ts`** — one pure line-system core: parallel screen-line geometry
  over a box (angle, spacing, phase, optional sinusoid wave), a generic clip-and-emit scanner
  that turns sampled lines into constant-width filled-outline strips against a caller-supplied
  inside test, the strip→path fragment emitter (evenodd-safe, flat caps), and the analytic
  `hatchDistance` for O(1) per-cell coverage in the node path.
- **Texture panel**: new `hatch` effect — straight or crossed screen lines carved into the
  fill (paper-colored lines through ink, the white-line engraving look). Knob mapping mirrors
  halftone: amount = line width, scale = line spacing, angle = direction, ramp = directional
  width gradient, wobble = line waviness, dropout = noise-clustered missing segments,
  variation = per-line width jitter; new `hatchStyle` chips (straight / cross).
- **Node graph**: new `mod.hatch` — re-renders any input raster as tone-driven parallel lines
  (angle × pitch × width × cross × wave), fixed ink or source colors, mirroring `mod.halftone`.
- No import changes: the ordered family already ships `screen-wave` / `lines-*` threshold
  screens, and the cell medium cannot carry per-line width.

## Capabilities

### Modified

- `pixel-styling`: the hatch texture effect (line systems carved into the fill).

## Non-Goals

- Iso-tone contours (marching-squares follow-up slice of V2, separate change folder).
- Plotter stroke-only SVG export (V6) — hatch lines stay filled evenodd outlines so canvas,
  PNG and SVG stay pixel-identical.
- Import dither changes; per-region tone-driven vector hatch (the cell medium has no tone
  field; the node path covers tone-driven hatching).
