# Vector Art Effects for Ditherlab — roadmap + Phase V1 (screen engine)

Assumptions (my recommended defaults, easy to change later): Phase 1 = halftone screen engine; the ~32-dither algorithm expansion from your previous plan runs after the vector epic; all export upgrades grouped in a late phase with PDF/HPGL as stretch.

## A. Research → feature map

Sources: [dither.neato.fun](https://dither.neato.fun/) (vector dither: halftone/lines/crosses/dots/scales marks, threshold vs scaled, angle/scale/offset, gradient test sources, SVG export), [Bitgrain blog](https://bitgrain.app/blog) (halftone screens, print separations/riso inks, SVG grain), Stipplism (tone-weighted stippling, symbol marks, randomness, clip to artwork), DitherFX (dither as live effect on existing art), [Vexy Lines](https://vexy.art) (Fontlab; 12+ algorithmic fills — engraved lines, waves, radials, spirals, halftones, scribbles, fractals, text — as editable Live Effects).

Every competitor converges on the same architecture: a **mark/screen engine driven by tone** + **line systems** + **non-destructive application** (Live Effect ≈ our node graph). Ditherlab already owns the hard infrastructure: `StyledPath[]` geometry pipeline feeding canvas/PNG/SVG identically (`geometry.ts`), `marching-squares.ts`, metaball fields, halftone dot machinery (`texture-halftone.ts`, documented "dots only" gap), 28 cell shapes (`cell-shape-defs.ts`), 8 grid lattices incl. polar (`grids*.ts`), glyph tiles, vtracer port with curve fitting (`trace/fit-curves.ts`, `trace/centerline.ts`), and a node domain reserved for "future contour/SDF nodes" (`nodes/types.ts`). Competitor features map onto this: neato's 6 shapes → our 28 shapes + glyphs; Vexy's fills → line systems + lattices; Stipplism's symbols → glyph-tile marks; DitherFX's live effect → `mod.*` nodes.

## B. Architecture: one screen engine, many faces

New pure-engine family `src/engine/screen-*.ts` (split per the 400-line ratchet from day one):

- `screen-config.ts` — types + params schemas (mark, lattice, tone map, angle, scale, offsetX/Y, seed, strength)
- `screen-marks.ts` — MarkShape registry: all 28 cell shapes (via `cell-shape-frag.ts`) + line/ellipse marks; mark params (thickness/points/rotation reuse `ShapeParams`)
- `screen-tone.ts` — tone field builder (doc cells → Float32 luminance via cached `hexLuminance`; import sample buffer path), tone-map modes: threshold, size (`toneScale`), density (stochastic drop), later shape-morph/twist
- `screen-lattices.ts` — screen grids: square, rotated (angle), hex, diamond, brick, radial rings, sunburst, spiral (Archimedean), phyllotaxis; offset/scale; builds on `grids.ts` patterns
- `screen-lines.ts` (V2) — parallel hatch (angle/spacing, width-by-tone), cross-hatch + engraving per-band angles (15/75/0/45), waves
- `screen-contours.ts` (V2) — iso-tone contours: `marchingSquares` over the tone field → `trace/fit-curves` smoothing → stroked paths
- `screen-stipple.ts` (V3) — weighted Poisson-disk sampling + Lloyd relaxation, count vs density mode, size/rotation jitter, any mark incl. user glyph tiles ("symbols"), clip via `shapefill.ts`
- `screen-inks.ts` (V4) — tone-band separation, CMYK rosette, riso overprint
- `screen-engine.ts` — facade: tone field + config → **dual output**: `{ paths: StyledPath[], mask: cellMask }` — vector fragments render identically on canvas/PNG/SVG (ADR-0001/0002-safe), the boolean cell mask keeps the pixel canvas, brushes and pixel-art workflow first-class.

## C. Phases (each = OpenSpec change first, then implementation, full gate at the end)

- **V1 `add-screen-engine`** (flagship, this session): marks + tone maps + lattices + dual output. Wired into all four surfaces: import dialog (new `screen` dither family — catalog row + dispatch, galleries/grouped select derive automatically per `dither-catalog.ts` pattern), texture panel (mark registry beyond dots — closes the documented halftone gap), fill screen mode, and a `mod.screen` node on the reserved `vector` domain. Bench entry + PERFLOG row (O(cells), scratch reuse per `geometry-shape.ts`).
- **V2 `add-line-systems`**: hatch / cross-hatch / engraving / waves + iso-tone contours; stroke width by tone; plotter-ready stroked output; `mod.hatch`, `mod.contour` nodes; presets (pencil, woodcut, engraving).
- **V3 `add-stipple-engine`**: Stipplism-style stippling with glyph/symbol marks, jitter, clipping, count control.
- **V4 `add-ink-separation`**: duotone/tritone/CMYK rosette, riso overprint preview, per-ink SVG `<g>` groups; neato-style test-pattern generator (linear/radial/conic/noise gradients) as import source + `source.gradient` node.
- **V5 `add-flow-decorative-fields`**: scribble, concentric/maze/fractal fills (Vexy's long tail), flow/curvature streamlines (smoothed gradient field + streamline integration); shape-morph tone map.
- **V6 `upgrade-vector-export`**: physical units (mm viewBox), stroke-only plotter mode (if not landed in V2), polyline simplification (reuse `trace/simplify` RDP) for file size, per-ink groups (if not in V4); stretch: PDF and HPGL from the same geometry.
- **D-series (after the vector epic)**: your previous plan's Phase 1 (~32 dither algorithms), Phase 3 (text/ASCII + ASCII export), Phase 4 (hybrid per-band specials) — scope unchanged.

## D. V1 implementation detail

1. Write roadmap doc `docs/roadmap-vector-effects.md` + OpenSpec change `openspec/changes/add-screen-engine/` (proposal, design, specs, tasks).
2. Engine: `screen-config.ts`, `screen-marks.ts`, `screen-tone.ts`, `screen-lattices.ts`, `screen-engine.ts` + colocated tests. Facade stays under caps; no React/DOM in engine.
3. Wiring: `dither-catalog.ts` family row + dispatch; texture panel mark upgrade; `mod.screen` node (`src/engine/nodes/screen.node.ts` + registry + preset recipes); i18n en+ru for every user-facing id/param.
4. Conformance tests: determinism (seeded), strength-0 ≡ baseline, tone monotonicity (lighter tone never yields larger/denser marks), evenodd hole correctness (ring marks), lattice coverage/no-NaN at edges, golden SVG-fragment snapshots for representative mark×lattice pairs; perf ratchet in `perf-stress.test.ts` style.
5. Full gate: `format:check → lint → arch:check → knip → tsc --noEmit → test` (+ `build` at the end), bench + PERFLOG row, design review for UI-touching parts. Commit messages proposed per phase; you run `git commit`.
6. Stretch if budget remains after V1 is green: start V2 (line systems).

Note: your uncommitted `add-dither-registry` work (dither catalog) is untouched by this plan and is the exact registry pattern V1 extends — worth committing before we start.