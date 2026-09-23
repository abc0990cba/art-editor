# Proposal: fix-bridge-junction

## Why

In Corner + Bridge connectivity the junction overlay is a large rounded square (side 0.6 cell,
almost circular) centered on the shared corner. For a diagonal pair it sticks out perpendicularly
to the cell diagonal, reading as a detached "ball" instead of a joint, and the junction looks
different depending on which diagonal direction the pair runs. Additionally, the per-corner
radius controls are shown for non-square grids although rounded-polygon cells only support a
uniform radius.

## What Changes

- Replace the bridge overlay with a **diamond aligned to the junction**: vertices at the
  midpoints of the four cell edges meeting at the shared corner, filleted with the concave
  radius. The overlay is symmetric under 90° rotation and reflection, fills the junction
  uniformly in all four diagonal directions, and never extends past the cell envelope.
- Hide the per-corner radius controls unless the grid is square and the render mode is pixels
  (non-square cells support only a uniform radius; connectivity and sub-cells are already
  square-only).

## Capabilities

### Modified

- `pixel-styling` — ADDED requirement: junction overlay alignment and direction symmetry;
  ADDED requirement: square-only per-corner controls.

## Non-Goals

- Changing pinch (corner) mode behavior or metaball junction kernels
- Per-cell bridge sizing
