# Production audit: drawing artifacts, brush-actual state, grid coverage

Audit confirmed 10 concrete defects across the three classes the request names. Plan = fix all of them with regression tests, verify with the full gate chain plus a browser visual sweep across every grid. Defaults taken (no answers returned): clip background on screen **and** exports; full fix scope; overlay guides (symmetry spokes/repeat lines/diffusion ring) stay unclipped — they are temporary aids, not artwork, and are never exported.

## Track A — Nothing outside the drawable area (grids)

The lattice **is** the canvas; the only cell-free regions are: radial plate (2·rows+2) vs cell disc (r=rows) → 1-unit ring + 4 corners; rotated grids (incl. square at 45°) → 4 cell-free corners of the bounding box. Today the checkerboard/solid background fills the full extent rect, and metaball clipping exists for radial only.

- **A1. Coverage geometry in the engine.** New small module `src/engine/grids/coverage.ts` (behind the `grids/index.ts` facade): returns the drawable coverage as a polygon (points + kind), derived from the lattice — full plate rect for square/hex/hexFlat/triangle/rhombille/diamond/iso/brick/octasquare; disc (center, r=rows) for radial; rotated base rect for `rotate.ts` grids. Consumable by both Canvas2D and SVG. Unit-tested per grid type.
- **A2. Stage background clipped** — `stage-paint-layers.util.ts` `ensureBackground` fills through the coverage path (checkerboard pattern and solid `doc.bg` alike); the bg key gains the coverage identity so switching grid type rebuilds the layer.
- **A3. Exports match the stage** — `engine/output/svg.ts` (clip-path/polygon fill instead of full rect) and `engine/output/png.ts` (export + thumbnails) use the same coverage.
- **A4. Metaball spill on rotated grids** — extend the clip predicate at `grids/geometry.ts:312-316` (radial-only today) with a rotated-rect test (inverse-rotate the point, inside base-rect check); diffusion-contour inheritance verified.
- **A5. Art-layer safety net** — clip `ensureArt` to the extent rect (`stage-paint-frame.util.ts`), matching the export viewBox. Protects against border overflow from rotated cell forms (`cell-shapes/frag.ts` placePoints) and `angleJitter` polygon rotation on all grids.

## Track B — Stray pixels / input artifacts (pencil, line, fill)

- **B1. Multi-touch stomping** — `canvas-stage.component.tsx` pointer handlers never check `pointerId`; a second finger replaces the in-flight drag and paints dabs. Fix: record the owning `pointerId` in `drag.current`; ignore pointerdown/move/up from other pointers while a drag is active.
- **B2. Fill leaks through diagonal outlines** — region flood in `engine/shapes/fill.ts` is 4-connected while line/ellipse/pen outlines are 8-connected Bresenham; `align:'outer'` filtering then lets leaked cells pass. Write the failing test first (thin 45° line / thin ellipse with shapePaint.fill), fix connectivity alignment, keep `perf-stress` ratchets green.
- **B3. Symmetry popping** — `engine/effects/symmetry.ts` truncates repeat-lattice orbits at a cap, so copies pop in/out as the pointer moves. Make truncation deterministic (stable priority, e.g. distance from the stroke point) so preview is stable; keep the perf budget.
- **B4. One-frame flicker at commit** — commit nulls staging then bumps a frame that still renders the old geometry closure (`use-canvas-staging.hook.ts:695`, `canvas-stage.component.tsx:378-388`): the just-drawn stroke blinks off. Keep staging composited until the rebuilt geometry paints (sync rebuild for the post-commit frame or one-frame-deferred teardown), without breaking undo.
- **B5. Pen draft survives undo** — pen staging subscription watches only `pen.path` (`use-pen-tool.hook.ts:353-361`); Ctrl+Z mid-draft leaves ghost ink over the reverted doc. Rebuild/clear pen staging on doc identity change.
- **B6. Wrong preview color for a new color** — pencil staging carries no palette, so a color not yet in the palette previews as palette[0] until commit. Give pencil staging the same `st.palette` treatment shape staging has; verify commit appends the color exactly once.

## Track C — Brush always actual (stale caches)

- **C1. Texture fragment cache** — `hashCells` (`engine/texture/region-index.ts:86-106`) never mixes `c.h`: change Pixel Style sizeY with a texture active → cached specks render in wrong places session-wide. Mix `c.h` into the digest; test that the same cells with different sizeY produce different digests.
- **C2. Style grouping omissions** — `elementStyleKey` (`engine/geometry/elements.ts:33-95`) and `sameElementStyle` (`engine/core/doc-style.ts:28-75`) both omit `texture.htLattice`, `texture.hatchStyle`, `metaball.strokeWidth`: strokes frozen with different hatch/lattice/metaball-stroke merge into one render group styled by the first, and new ink can inherit a stale texture. Add the fields to both; audit `samePixelStyle` for any further omissions while there; tests assert different groups per differing field.

## Track D — Existing uncommitted pen fix

The modified `use-pen-tool.hook.ts` (working tree) fixes a real stale-handle race in the bezier pen (latest handles now land on pointerup even when the rAF flush never runs; pending-path snapshot applied before clearing). Keep it, cover with the gates + a manual pen smoke test, and propose its own commit message (per repo rule, the human commits).

## Verification (the "recheck")

1. Regression tests colocated with each fix (engine `*.test.ts` convention).
2. Full gate chain green: `npm run format:check`, `npm run lint`, `npm run arch:check`, `npm run knip`, `npx tsc --noEmit`, `npm test`.
3. Browser visual sweep on the dev server: for every grid type (square, hex, hexFlat, triangle, rhombille, radial, diamond, iso, brick, octasquare, square rotated 45°) in pixel mode — pencil stroke + line stroke screenshots; assert no background/checkerboard, grid overlay or artwork outside the drawable coverage, no stray cells, correct brush rendering after change-revert cycles. Before/after evidence captured.
4. `npm run bench` — confirm no regression beyond noise (bg clip is a baked layer; hashCells +1 mix; style keys +3 fields); log a PERFLOG row if anything moves.
5. Finish with proposed Conventional Commit messages per logical fix group (human commits).
