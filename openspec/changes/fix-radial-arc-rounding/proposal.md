# Proposal: fix-radial-arc-rounding

> Stacks on `add-grid-rounding` (implemented, pending archive): its "Grid-aware rounding" and
> "Local-size metaball splats" requirements are modified here. Archive that change first.

## Why

Radial wedges sampled their arc edges at a fixed 4 points per stop interval, so every arc
chord turned by `sectorSpan/5` — above the fillet core's ~10° corner threshold for any ring
with ≤ 7 sectors. Outline mode then filleted arc samples as if they were corners (scalloped
silhouettes), pixels mode measured the rounding base across single chords (starved, noisy
rounding), and metaball splats shrank by √chord. Even-mode grading always grades ring 0 down
to 2 sectors — a half-disc wedge whose boundary has only two true corners — and the rounding
core's "< 3 corners = degenerate" guards emitted those cells plain: no pixel rounding, no
outline fillets, metaball splats measured across single chords. Metaball fields on radial had
no radial border clamp either: blobs spilled past the disc into the empty square margin around
it (the square grid clamps at its border nodes; the polar analog was missing).

## What Changes

- `grids/builders.ts` (`makeRadial`): adaptive arc sampling — each arc stop interval is
  subdivided into `max(4, ceil(interval / 8°))` chords, keeping every sample turn under the
  fillet core's corner threshold. The count is a pure function of the interval, so shared arc
  pieces keep identical vertices on both sides of a ring boundary. Intervals ≤ 32° (every
  radial with ≥ 12 uniform sectors, including the default document) keep 4 samples and stay
  byte-identical.
- `geometry/poly-path.ts`: the "< 3 corners = degenerate" guards in `filletPath` and
  `minCornerRun` relax to "< 1 corner" — one- and two-corner loops (radial half-disc wedges)
  round their true corners; corner-free loops (full-disc unions, circle-sampled boundaries)
  stay plain polygons. `minCornerRun` of a half disc becomes the merged diameter run, which
  also feeds the pixels-mode radius base and the metaball splat scale of those cells.
- `geometry/metaball-field.ts` + `grids/geometry.ts`: `buildMetaballField` takes an optional
  doc-unit `clip` predicate zeroing field nodes outside a region; the radial grid passes the
  disc (`r ≤ rows`) so blobs close along the canvas circle instead of spilling into the
  square margin.
- Tests: coarse uniform sectors fillet only true corners (cols 4/6/8), even-graded rings stay
  smooth down to the half-disc center, ring-0 half-disc union is a corner-free disc, pixels
  rounding on every even ring, metaball adjacency merges with true sector offsets, disc
  clamp, half-disc `filletPath`/`minCornerRun` semantics.

## Capabilities

### Modified

- `pixel-styling` — MODIFIED requirement: Grid-aware rounding (adaptive radial arc sampling;
  one- and two-corner loops round their true corners).
- `metaball-rendering` — MODIFIED requirement: Local-size metaball splats on non-square grids
  (two-corner cells measure their merged run); ADDED requirement: Radial metaball disc clamp.

## Non-Goals

- Metaball capsules bridging radial edge neighbors — merging stays size-proportionate: cells
  whose arc pitch exceeds the kernel reach (outer rings of coarse radials) stay separate,
  exactly like enlarged square cells would.
- Corner connectivity on non-square grids (stays square-only per `grid-types`).
- True-arc path representation for silhouette arcs (sampled chords stay).
