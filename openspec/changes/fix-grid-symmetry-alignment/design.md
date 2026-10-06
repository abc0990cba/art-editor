# Design: fix-grid-symmetry-alignment

## Context

Non-square grids resolve finite symmetry modes through `Grid` lattice primitives. The previous
design exposed `cellByAngle` (radius bucket ≤ 0.75 + nearest angle about the canvas middle) and
`polarAngleMaps` (angle maps about the canvas middle). Three defects followed from the canvas
middle not being a symmetry point of the lattices:

1. The pointy-top hex bounding box is half-step asymmetric (`w = √3·(cols + 0.5)`), so the middle
   axis never maps hex centers onto hex centers — every mirror landed between two cells and the
   nearest-angle pick alternated by row parity.
2. `cellByAngle` skips the source cell, so an on-axis cell (θ exactly ±π/2) got a spurious
   "mirror" partner at a nearby angle.
3. The radius bucket (0.75) spans neighboring hex rows, letting the nearest-angle tie pick cells
   in a different row; results were not involutive and depended on painting order.

## Decisions

- **Snap axes to the lattice, don't approximate after the fact.** `symmetryAxes(grid)` builds the
  candidate axis set from cell-center coordinates plus midpoints of neighboring coordinates, then
  keeps the candidates whose 2D reflection maps probed cell centers back onto cell centers (a
  nearest-cell `cellAt` hit whose center matches within 1e-4; images outside the lattice span are
  allowed — those copies are dropped). The nearest surviving candidate to the canvas middle wins;
  numeric ties resolve to the larger candidate. The 2D probe is what rejects the canvas middle
  itself on hex: it mirrors the coordinate sets onto each other while every image lands between
  two cells.
- **Centroid mapping, not center mapping.** Rhombille faces share the hex center; mapping the
  polygon centroid keeps the three faces distinguishable (vertical mirror swaps face 0 ↔ 1 exactly).
  For the regular lattices the centroid is the center, so nothing changes there.
- **Memoized symmetric completion.** Each copy's cell map caches in a per-grid
  `Map<string, Map<number, number>>` (WeakMap<Grid, …>; grids are process-cached). Involutive
  copies record their pair in both directions when the image is unclaimed, making on-axis cells
  self-symmetric and pair resolution order-independent. Rotations are memoized forward only.
- **Rotation center ≠ mirror axes intersection.** Snapping both axes independently on hex can
  intersect an odd-row line with an even-row line — a point that is not a cell center, so 6-fold
  rotations do not close. `rotationCenter` snaps the intersection to the nearest cell center
  (`cellAt`); kaleido's mirror flips about that center's vertical line, matching the square math's
  `[dx, dy] / [−dx, dy]` sources.
- **Honest limits.** Triangle rows and rhombille kites have no horizontal mirror axis; the exact
  scan finds no candidate and the fallback picks the nearest center line. Copies stay
  deterministic and cell-snapped, but a pair may resolve asymmetrically — the lattice itself has
  no exact answer.
- **Guides follow the math.** `drawGuides` resolves `symmetryAxes`/`rotationCenter` from the doc
  grid and draws axes, diagonals, spokes and the orbit circle there, so what the user sees is what
  the stroke does.

## Alternatives considered

- Keep angle maps and fix `cellByAngle` ties — cannot work: no tie rule fixes an axis that is
  off-lattice by a quarter step; the whole orbit would still jag per row.
- Snap the grid under the symmetry (re-center/re-size the canvas so the middle is a lattice axis)
  — mutates every document on grid switch and moves existing artwork; axis snapping achieves the
  same alignment without touching the document.
- Per-type axis formulas (e.g. `HEX_W · round(w / HEX_W) / 2`) — duplicated lattice constants for
  every builder and broken for rotated wrappers; the 2D probe is generic, rotation-agnostic and
  unit-testable through the public `Grid` interface.
