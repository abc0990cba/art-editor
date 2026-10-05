# Design: add-grid-rounding

## Context

Rounding is render-time vector filleting. Two emitters existed: `roundedPolygonPath`
(pixels-mode cell polygons + polygonal cell forms) and `emitFilletPath` (outline-mode
silhouettes). Both emitted corner arcs with radius = tangent length `t` — exact only for 90°
corners, which is all a square grid has.

## Decisions

### One shared fillet core

`filletPath(pts, chamfer, radiusFor, keepCorner?)` in `geometry/poly-path.ts` owns the whole
engine: dedupe, corner detection (cosine < 0.985 ⇔ turn > ~10°), loop topology (corner runs,
majority winding), tangent emission. `roundedPolygonPath` is `radiusFor = () => r`;
`emitFilletPath` maps loop-majority convexity to `rCvx`/`rCcv` and forwards `keepCorner`
(squareEdges). Rationale: one algorithm, one set of guarantees; outline.ts loses ~55 lines and
its complexity override.

### True tangent geometry

Arc radius `R = t / tan(θ/2)` where θ is the exterior turn. At 90°, `R = t` — byte-identical
square output (all existing square tests pass unmodified). The arc always exists: `R ≥ chord/2`
holds for every θ ≤ 180°, so SVG never rescales radii. Sweep flag and tangent points keep the
old formulas.

### Run-aware clamping

`t = min(r, runToPrevCorner/2, runToNextCorner/2)` — runs sum the chords across arc samples and
collinear splits (radial wedges, split triangle bases). When `t` exceeds the first chord, the
fillet exit point interpolates along the run (`runPoint`) and covered samples are dropped from
emission; the walk starts at the first corner so consumption survives the loop seam. Residual
tangent error at interpolated exits ≤ the run's own bend (≤ ~a sector's angle) — invisible at
grid sampling densities.

### Per-grid radius base

`minCornerRun(poly)` = shortest corner-to-corner run, with degenerate polygons falling back to
the shortest segment. The non-square pixel path uses `radius × minCornerRun` — same semantics
as the square grid's `radius × min(cellW, cellH)`. Unit-pitch lattices (hex, triangle,
rhombille, diamond, iso, brick) measure 1; radial wedges measure `min(ring thickness, arc
length)`; octasquare gap squares measure their true side.

### Metaball splat scale

Splats carry the existing `r` multiplier with `√minCornerRun`: sub-unit cells shrink their
kernels (no saturated center blob on radial inner rings, no 4×-oversize lone blobs) while the
square root keeps same-ring neighbor centers inside each other's merge radius — adjacent
sectors still form one blob (regression-tested).

## Risks / Trade-offs

- Deep fillets over strongly curved runs end with a small tangent mismatch (bounded by the
  run bend). Accepted; a true-arc loop representation would remove it but is not justified at
  current sampling density.
- `gridMetaballField` now calls `grid.polygon(i)` per painted cell (allocation) — metaball is
  already field-solve-bound; no measurable regression expected (perf-stress suite stays green).
