# Pixel generative filter pack (6 effects, 3 groups)

## What we're building

Six new selection "auto filters" that transform ink directly in pixel space, added to the selection FX menu ("More" panel of the selection action bar), next to warp / stylize / pixel ops. All are deterministic, integer-exact, undoable, square-grid-only — the same contract as the existing effect families. They apply to the current selection (select-all to filter the whole grid).

**Gooey / metaball** (new menu group `fx.gooey`)
- **Blobify** (popover) — metaball field merge: splat a power-law kernel from every ink cell (same falloff math as engine metaball rendering: tight/smooth/gooey), then keep cells where field ≥ iso → nearby strokes fuse into rounded goo. Params: radius 1–8, iso 20–90%, falloff chips, square-edges toggle. Added cells inherit the strongest contributing cell's owner/color.
- **Smoothen** (chips ×1/×2/×3 passes) — classic pixel-art silhouette rounding: fills concave corners, trims convex corners (guards so 1-px lines and endpoints survive).

**Figures in pixels** (new group `fx.figures`)
- **Figurefy** (popover) — "a figure inside every pixel": each ink cell becomes a k×k block (scale 2–6) where cells are inked iff the chosen figure covers their center, via the existing `cellShapeHit` (circle, ring, diamond, triangle, star, cross, heart, hexagon — the shapes with hit tests). Mode chips: *figure only* / *figure cut out of a block*.
- **Patternize** (popover) — re-masks ink with a fill pattern via the existing `patternAt` from `texture/fill-patterns.ts`: dots, checker, grid, hatch, stripes-h/v, rings, bricks. Params: pattern picker, scale (period), density threshold, invert.

**Organic filters** (new group `fx.organic`)
- **Drip** (chips: 4 directions ↘↙↗↖, like longShadow) — gravity melt: per column, seeded random-length trails grow in the chosen direction. Params (defaults, not UI): length, variation, seed via `hash2`.
- **Dissolve** (chips: 25/50/75%) — noise-gated removal: ink survives where seeded hash (or value-noise when clumped) passes the threshold.

## Files

Engine (pure ink-map transforms, mirroring the morpho/warp pattern; `effects/` has no facade — file-path imports):
- NEW `src/engine/effects/gooey.ts` — `blobifyInk`, `smoothenInk`
- NEW `src/engine/effects/figures.ts` — `figurefyInk` (reuses `cell-shapes` `cellShapeHit`), `patternizeInk` (reuses `texture/fill-patterns` `patternAt`)
- NEW `src/engine/effects/organic.ts` — `dripInk`, `dissolveInk` (reuses `texture/core` `hash2`/`valueNoise`)
- NEW `src/engine/effects/filters.ts` — `FilterOp` union, merged `FilterParams` + `DEFAULT_FILTER_PARAMS`, chip const lists (`FILTER_OP_CHIPS` etc., `WARP_KINDS` precedent), `filterInk()` dispatcher
- Colocated tests `gooey.test.ts`, `figures.test.ts`, `organic.test.ts` — deterministic pixel-exact pins (two dots fuse under blobify; smoothen rounds a square's corners; figurefy circle @ scale 3 exact mask; patternize checker keeps ~half; drip trail lengths; dissolve hash gating)

State:
- `src/state/effect.slice.ts` — one new action `filterSelection(op, params?)` via the existing `bakeSelection` helper (same guards: non-empty selection, `isPlainSquare`); no recolor ops, palette untouched
- `src/state/editor.store.ts` — declare `filterSelection` on `State` (next to the other three effect actions)

UI:
- NEW `src/features/canvas/selection-filter-popover.component.tsx` — per-op controls (Slider/Chip/CheckRow) with live ghost preview through the staging surface (snapshot once, repaint per tick, Apply commits one undoable action); modeled on the warp popover
- NEW `src/features/canvas/use-selection-ink-preview.hook.ts` — extracts the snapshot+ghost logic that is today duplicated between the warp popover and `effect.slice`; refactor `selection-warp-popover.component.tsx` onto the hook (net-negative lines)
- `src/features/canvas/selection-fx-menu.component.tsx` — three new groups; popover ops open the popover, chip ops use inline preset rows (the `PIXEL_OP_OPTIONS` pattern)

i18n: new keys in BOTH `en.messages.ts` and `ru.messages.ts` (type-enforced mirror): `fx.gooey|figures|organic`, `filter.<op>` + `filter.<op>.desc` for all six, param labels (`filter.radius`, `filter.iso`, `filter.falloff.*`, `filter.squareEdges`, `filter.scale`, `filter.figure`, `filter.mode.*`, `filter.pattern`, `filter.density`, `filter.invert`, `filter.direction`); reuse existing `shape.*` keys for figure names where present.

Contracts & docs (repo workflow):
- NEW `openspec/changes/add-pixel-generative-filters/` — proposal, design, tasks, spec delta (new capability `selection-generative-filters`: SHALL statements per op, deterministic + undoable + square-grid-only), following the layout of `add-pixel-stylization-pack`; created first
- Update `docs/modules/effects.md` and the effects row in `docs/architecture/engine-map.md`

## Verification

- Full mandatory chain green after each step: `npm run format:check`, `npm run lint`, `npm run arch:check`, `npm run knip`, `npx tsc --noEmit`, `npm test`
- UI follows `design-conventions` (28 px chips, `max-lg:min-h-11` touch targets, popover widths like the warp popover); design-review checklist before hand-off
- I propose the ready Conventional Commit message at the end (`feat(effects): generative pixel filter pack — blobify, smoothen, figurefy, patternize, drip, dissolve`); you commit

## Order

1. openspec change folder (contract first)
2. engine modules + tests (green chain)
3. store action + State declaration
4. hook extraction + popover + menu groups
5. i18n en/ru
6. docs + engine-map, final full check chain