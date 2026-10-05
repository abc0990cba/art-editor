# Proposal: add-pixel-generative-filters

## Why

The selection FX menu's generative vocabulary stops at warps, three stylize post-ops and nine
morphology ops — all of them reshape the existing ink, none of it *regenerates* it. There is no
metaball-style gooey fusion in pixel space (the metaball render mode lives outside the pixel grid
and cannot be baked), no way to turn each pixel into a small figure, no texture masks beyond the
non-destructive fill patterns, and no organic auto-filters (melt, dissolve). Six new deterministic
selection filters close that gap.

## What Changes

- **Gooey group** (`engine/effects/gooey.ts`):
  - `blobify` — metaball field over the selection ink: every ink cell splats a power-law kernel
    (falloff tight/smooth/gooey, same math as the metaball render mode), every cell in the padded
    box whose field ≥ iso becomes ink attributed to its strongest contributor. Nearby strokes fuse
    into rounded goo; corners round themselves.
  - `smoothen` — 1..3 passes of concave-corner filling: every empty cell whose 2×2 block holds the
    other three inked cells becomes ink. Turns jaggied diagonals into smooth staircases.
- **Figures group** (`engine/effects/figures.ts`):
  - `figurefy` — "a figure inside every pixel": each source cell becomes a k×k block (2..6)
    anchored at the selection box origin; sub-cells are inked where `cellShapeHit` places the
    chosen figure (circle, ring, diamond, triangle, star, cross, heart, hexagon, moon, teardrop).
    Modes: figure only / figure cut out of a full block.
  - `patternize` — re-masks the ink with a fill pattern via `patternAt` (checker, grid, hatch,
    stripes h/v/diag, dots, bricks, rings, zigzag) with scale, density and invert knobs.
- **Organic group** (`engine/effects/organic.ts`):
  - `drip` — gravity melt: from every run-end cell (no ink neighbor in the drip direction) a
    seeded, hash-varied trail grows through empty cells along ↓/↑/←/→.
  - `dissolve` — noise-gated removal: ink survives only where a seeded per-cell hash (scale 1) or
    smooth value noise (scale > 1) passes the amount threshold.
- **Store/UI**: one new undoable `filterSelection(op, params)` action in the effect slice; the FX
  menu gains three groups. Blobify / figurefy / patternize open a live-preview popover (the warp
  pattern); smoothen / drip / dissolve are one-click preset chips (the pixel-ops pattern). The
  snapshot + ghost-preview plumbing is extracted into a shared hook and `selectionInk` moves into
  `selection-xform.ts`.

## Capabilities

### Added

- `selection-generative-filters`: the six generative auto-filters on the selection ink.

## Non-Goals

- Node-graph (`mod.*`) exposure — the destructive selection path ships first, nodes are a
  follow-up.
- Non-square grids — same square-only constraint as every selection effect.
- Recoloring variants — all six ops preserve source values and owners; palette is untouched.
