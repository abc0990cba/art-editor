# Roadmap: vector art effects

Where Ditherlab's "vector artistic effects" direction is heading: research-derived feature
phases on top of the one geometry pipeline (`StyledPath[]` → canvas / PNG / SVG). Each phase
lands as an OpenSpec change with the full regression gate. English on purpose — this is the
durable plan; change folders under `openspec/changes/` carry the behavior contracts.

## Research basis

Feature analysis of the reference tools (2026-10-02): dither.neato.fun (vector dither marks,
threshold vs scaled, angle/offset, SVG export), Bitgrain (halftone screens, print separations,
riso inks, SVG grain), Stipplism (tone-weighted stippling, symbol marks, randomness, clip),
DitherFX (dither as a live effect on existing art), Vexy Lines / Vexy Linestra (Fontlab; 12+
algorithmic vector fills — engraved lines, waves, radials, spirals, halftones, scribbles,
fractals, text — as editable live effects). Every tool converges on the same architecture:
a mark/screen engine driven by tone + line systems + non-destructive application (their
"live effect" ≈ our node graph).

## Shipped

- **Screen engine (V1, `add-halftone-screen-engine`)** — `screen-engine.ts`: lattices
  (grid / hex / rings / sunburst / spiral / phyllotaxis / scatter), 10 marks, size / density /
  twist tone maps; wired into the texture panel (marks + lattices), the fill `screen` pattern,
  the `mod.halftone` node (tone-aware via `EvalContext.luma`) and import (`screen-45`,
  `screen-wave`, `cmyk` rosette separation).
- **Dither library (D-series)** — ~60 dither ids across ordered / diffusion / path / special /
  glyph families (Bayer up to 32, IGN, blue noise, void-and-cluster, Yliluoma, Hilbert and
  scan-path diffusion, ASCII / braille glyphs, hybrid per-tone bands, CMYK), the declarative
  dither catalog (`dither-catalog.ts`) and per-algorithm bench baselines.

## Phases ahead

- **V2 `add-line-systems`** (this change) — hatch line systems as vector geometry:
  `screen-lines.ts` (parallel screen lines, wave, stroke-to-filled-outline strip emitter,
  analytic coverage) + the texture `hatch` effect (straight / crossed lines carved into the
  fill, ramp / wobble / dropout distress) + the tone-aware `mod.hatch` node. The Vexy
  engraving/waves signature. Iso-tone contours (`screen-contours.ts` on `marching-squares`)
  are the follow-up slice.
- **V3 `add-stipple-engine`** — Stipplism-style stippling: weighted Poisson/blue-noise sampling
  with relaxation, count vs density modes, any mark incl. user glyph tiles ("symbols"), size
  and rotation jitter, clip to artwork. Builds on `screen-engine` scatter + `texture-core`
  distributions.
- **V4 `add-ink-separation`** — duotone/tritone splits, riso-style overprint preview, per-ink
  SVG layer groups; neato-style test-pattern generator (linear/radial/conic/noise gradients)
  as an import source and a node source.
- **V5 `add-flow-decorative-fields`** — scribble, maze and fractal fills, flow/curvature
  streamlines (smoothed gradient field + streamline integration), shape-morph tone maps.
- **V6 `upgrade-vector-export`** — plotter mode (stroke-only paths), physical units (mm),
  polyline simplification for file size, per-ink groups (if not landed in V4); stretch: PDF,
  HPGL.

## Standing constraints

- Engine stays pure (ADR-0001); one geometry pipeline, evenodd fill rule is load-bearing.
- Per-file/per-function size ratchets — split new engines per concern from day one
  (`screen-*.ts`, `texture-*.ts`).
- Every perf-relevant phase leaves a bench + a `bench/PERFLOG.md` row.
- i18n en+ru for every user-facing id; design review for UI-touching phases.
