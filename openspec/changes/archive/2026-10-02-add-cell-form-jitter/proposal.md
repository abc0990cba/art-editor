# Proposal: add-cell-form-jitter

## Why

Every cell of a color renders with exactly the same figure: same size, same angle. Uniformity
is what makes generated mosaics, confetti fields, brick courses and organic dot-ramps look
mechanical — the single most requested "alive" quality in raster-pattern tools (Vectoraster's
per-point variation) is per-cell variation, and the editor has none. Hand-alternating sizes
cell by cell does not scale past a few dozen cells.

## What Changes

- **Size spread** — `PixelStyle.sizeJitter` (0–100%, default 0): each cell's figure shrinks by a
  deterministic pseudo-random factor up to the spread, driven by smooth value noise over the
  cell's grid position plus a seed — neighbors correlate (organic clumping) instead of white
  noise flicker.
- **Angle spread** — `PixelStyle.angleJitter` (0–180°, default 0): each rotated form's angle
  gets an added deterministic offset within ±half the spread. Applies through the existing
  shape-fragment rotation (meaningless for `circle`/`ring`).
- **Seed** — `PixelStyle.jitterSeed` (1–9999) with a Randomize chip: the same seed always
  produces the same field, so the look is reproducible and undo-stable.
- Applies in `pixels` render mode only (square and non-square grids alike); zero spreads keep
  today's byte-identical rendering and the RLE run-merge fast path.
- Works with (multiplies) tone-size scaling and X/Y stretch; per-cell variation composes with
  corner radius (radius scales with the figure).
- Persistence: tolerant project load, preset clamps, style equality and element style key
  enumerate the three new fields.

## Capabilities

### Modified

- `pixel-styling`: the independent X/Y stretch requirement gains the per-cell size/angle
  spread controls with seed reproducibility.

## Non-Goals

- Per-cell color or shape-form mixing (a separate future change).
- Jitter in outline/metaball modes or on connectors/texture specks.
- White-noise (uncorrelated) variation; animated/phased jitter.
- Independent X/Y jitter axes.
