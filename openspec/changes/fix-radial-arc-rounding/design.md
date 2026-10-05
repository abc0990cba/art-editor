# Design: fix-radial-arc-rounding

## Context

The generic lattice pipeline renders every non-square grid through polygon geometry:
`traceSilhouette` + the tangent-fillet core for outline, `minCornerRun`-based rounding for
pixels, center-splat fields for metaball. All three consumers depend on one property of the
cell polygons: vertices that turn less than ~10° (`CORNER_COS = 0.985`) are arc samples or
collinear splits, not corners. Radial arc edges violated that contract at coarse sector
counts: with the fixed 4-samples-per-interval subdivision, chord turn = `sectorSpan/5`, so a
60° sector produced 12° sample turns that the core read (and filleted) as corners.

## Decisions

### Fix the sampling, not the threshold

Raising `CORNER_COS` would misclassify genuinely shallow polygon corners on every lattice.
Instead `makeRadial.arcPoints` subdivides each stop interval into
`max(4, ceil(interval / 8°))` chords — sample turns stay ≤ ~8° < 9.9° with margin. Intervals
of ≤ 32° keep the old 4 samples, so every radial with ≥ 12 uniform sectors (including the
default 32-column document) renders byte-identical; only coarse and even-graded rings gain
samples (a 180° interval goes to 23 chords — still a tiny polygon).

The shared-arc invariant survives because the sample count is a pure function of the
interval: two vertically adjacent rings derive their stop endpoints from the same
`k·(2π/s)` products, and `interval/8°` is never an exact integer (intervals are rational
multiples of π), so `ceil` is stable and both sides emit identical vertices; the existing
1e-6 edge-key quantization absorbs the ulp noise in the endpoint arithmetic.

### Two-corner loops are shapes, not degenerate

Even-mode grading always bottoms ring 0 out at 2 sectors — a half-disc whose two radial
edges are collinear at the apex, leaving exactly two true corners. `filletPath` and
`minCornerRun` both treated `corners < 3` as degenerate (plain polygon / shortest segment) —
a square-era assumption ("a polygon has ≥ 3 corners") that half-discs violate. Both guards
relax to `corners < 1`: with 1–2 corners the run bookkeeping is well-defined (runs span the
whole loop between corners), `convexSign` still resolves from the turn signs, and the
emission walk is corner-count agnostic. Corner-free loops (full-disc unions — the most
common radial outline after merging) keep the plain-polygon fallback. Square-grid output is
unaffected: staircase loops, bridge diamonds and cell rects always carry ≥ 3 corners.

`minCornerRun(halfDisc) = 2` (the diameter, with both radial edges merged into one run) also
becomes the pixels-mode radius base and the metaball √-splat multiplier for those cells —
half-disc blobs now cover the wedge they represent instead of specking at the centroid.

### Radial metaball disc clamp

Square grids zero their border field nodes so contours always close inside the canvas; on
radial the equivalent boundary is the disc (`r = rows`), one unit inside the square canvas
plate. `buildMetaballField` gains an optional doc-unit `clip(x, y)` predicate applied as one
post-splat pass; `gridMetaballField` passes the disc test for radial only. The clamp also
serves the diffusion-guides overlay (same builder), keeping preview and render consistent.

## Risks / Trade-offs

- Denser chords on coarse rings grow radial polygons (≤ ~60 vertices on a 180° interval) —
  negligible next to the per-cell closure costs the generic path already pays.
- `minCornerRun`'s relaxed guard changes the metaball splat scale of half-disc cells by ~4×
  (0.36 → 1.41) — that is the intended proportionality fix; uniform-mode inner rings (≥ 3
  sectors, apex is a true corner) are untouched.
- Merging on radial stays size-proportionate: cells whose arc pitch exceeds the kernel reach
  (outer rings of coarse radials) never merge at any strength, mirroring enlarged square
  cells. Documented as a non-goal, not changed.
