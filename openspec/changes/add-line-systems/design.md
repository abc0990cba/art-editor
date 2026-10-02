# Design: add-line-systems

## Context

The texture family already owns the evenodd hole language (`texture-halftone.ts` fuses
overlapping dots into single-subpath blobs), the region scanner owns clipping against painted
fills (`RegionState.fits`), and `mod.halftone` established the tone-aware node pattern
(`EvalContext.luma`, sqrt tone→size). Line systems must reuse all three instead of inventing a
parallel pipeline.

## Decisions

- **Filled outlines, not stroked paths.** Texture fragments are evenodd subpaths punched into a
  fill; a thin line is a filled outline polygon. `stripPath` converts a sample polyline plus a
  constant half-width into one closed subpath (offset ±normal, flat caps). This keeps canvas /
  PNG / SVG identical with zero renderer changes. True stroked output is V6 plotter mode.
- **Constant width per run.** Width varies across lines (ramp, variation, node tone), not
  along one line, so each clipped run is a single-width strip — no variable-width offset
  geometry, no self-intersection risk.
- **One generic scanner.** `hatchFragments(scan)` in `screen-lines.ts` samples the line grid,
  asks `scan.inside(x, y, hw)` per sample, groups consecutive inside samples into runs and
  emits `stripPath` per run. Region (pixels/outline) passes `RegionState.fits`; the metaball
  field passes a `fieldSolid`-style test. Texture adapters stay thin
  (`texture-hatch.ts`); `texture-region.ts` / `texture-field.ts` gain only a dispatch branch.
- **Analytic node coverage.** `mod.hatch` never builds strips: `hatchDistance` returns the
  distance from a cell center to the nearest line centerline (wave included) in O(1); the cell
  is on when `distance <= halfWidth(tone)`. Cross = a second system at angle + 90°.
- **Knob reuse over new sliders.** `amount` = width share of spacing (matches "dot size"
  semantics), `scale` = spacing, `angle` = direction, `ramp` = directional width gradient,
  `wobble` = wave amplitude, `dropout` = noise-clustered missing segments, `variation` =
  per-line width jitter, `jitter` = per-line phase offset. Only `hatchStyle`
  (straight / cross) is a new field, optional like `htLattice` so old projects parse unchanged.
- **Budgets.** Line count coarsening mirrors the halftone stride logic (coarsen spacing until
  the estimated line count fits the sample budget); a global sample cap bounds worst-case path
  size on huge regions.

## Risks

- Evenodd safety: strips never overlap within one line (runs are separated), but cross lines
  from the two systems do overlap — two crossing strips XOR at the intersection, leaving a
  pinhole. Mitigation: emit the cross layer with a tiny overlap-aware union is overkill; the
  accepted V2 behavior is the classic crosshatch pinhole (matches hand-engraved crosshatch,
  visible only at width ≳ spacing). Documented in the spec scenario.
- Path size on dense screens: bounded by the coarsening + sample cap (bench row records cost).

## Alternatives rejected

- Reusing fillpatterns' threshold `hatch` (cell-quantized, no width, no vector quality).
- Stroked `StyledPath` emission from the texture pipeline (breaks the hole contract; renderer
  parity work belongs to V6).
- Per-cell dash stamping along lines (evenodd XOR at every joint unless clusters are fused —
  strictly more work than the strip).
