# Rework: pixel-size brushes, brush editor + presets, per-shape symmetry

## Goal
Replace the global "Subcells ×1/×2/×3" mechanism with a **brush pixel size** (draw a 5-cell pixel, then detail it with 2-cell pixels), add a **brush tip editor + brush presets**, and make **symmetry correct for every tool and mode**.

Confirmed decisions: snap-to-P-grid placement with Alt = free/centered · subcell chips removed (legacy docs keep internal `sub`, zero data loss) · shapes use the brush · full symmetry fix (shapes, fill, connector, previews).

## 1. Engine: brush model — NEW `src/engine/brush.ts`
- `Brush { size: number; pattern: boolean[] }` — `size` = pixel size in cells (1..`MAX_BRUSH=16`), `pattern` length `size²`, row-major, `true` = paints.
- Generators: `squareBrush(n)`, `circleBrush(n)`, `diamondBrush(n)`, `normalizeBrush()` (clamps size, fixes pattern length).
- `brushOffsets(brush): Array<[dx,dy]>` — active tip cells relative to anchor.
- Anchor math: `brushAnchor(hoveredCell, size, snap)` — snapped: `floor(cell/size)*size` (grid anchored at 0,0); free: `cell - floor((size-1)/2)` (tip centered under cursor).
- `BUILT_IN_BRUSHES`: named set (1px/2px/3px/4px square, circles 3/5/7, diamond 5, checker 4, corners, dots…).
- Unit tests in NEW `src/engine/brush.test.ts`.

## 2. Engine: symmetry transforms — `src/engine/symmetry.ts`
- Add `symmetryTransforms(bw, bh, mode, n, cell): Array<(x,y) => [x,y]>` for the finite modes (`mirrorX/mirrorY/quad/diag8/radial/kaleido`) — point-map per symmetry copy. Keep `symmetryPoints` (per-point orbit) for pencil/fill/ghosts and for repeat/wallpaper modes.
- Rationale: shapes must be **re-rasterized per copy** (map endpoints through each transform → `linePoints/rectPoints/ellipsePoints`), which fixes today's artifacts where a pre-rasterized ellipse/line is mirrored point-by-point (asymmetric gaps under quad/diag8/radial).
- Export a `mapPair(transform)` helper so connectors can map both endpoints with the *same* copy (incl. repeat ops: translation chosen from endpoint a, applied to both).
- Extend tests in `src/engine/symmetry.test.ts`: for mirrors/180° verify `rasterize(T(p,q)) == T(rasterize(p,q))`; radial yields n distinct in-bounds copies; group-closure test keeps passing.

## 3. Storage + store: brush state and brush presets
- `src/storage/db.ts`: `DB_VERSION` 2→3; upgrade adds a `brushes` object store (existing `projects`/`presets` untouched).
- NEW `src/storage/brushes.ts` — mirror of `storage/presets.ts`: `BrushPresetEntry { id, name, createdAt, updatedAt, brush }`, `listBrushes/saveBrush/deleteBrush`, in-memory fallback, `normalizeBrushEntry` validation.
- `src/state/store.ts`: UI (non-undoable) state `brush: Brush` (default 1×1 full), `brushSnap: boolean` (true); actions `patchBrush`, `setBrushSnap`; preset library actions `loadBrushes/createBrush/overwriteBrush/renameBrush/deleteBrush/applyBrushPreset` modeled on the existing preset actions (store.ts:268-355).
- `fillAt` gains symmetry: expand the seed via the orbit (existing `expand` logic moved to a shared helper) and flood-fill from each seed.
- Keep `sub`/`changeSub`/`setSub` for legacy docs and editor-preset compatibility; only the UI chips go away.

## 4. CanvasStage: stamping with brush + snap + correct symmetry
- Track Alt via keydown/keyup (ignore when target is an input).
- `stampBrush(idx, erase, alt)` (replaces `stampIdx`): compute anchor (snapped/free, in cells → ×sub for buffer), then for each orbit copy of the anchor (`symmetryPoints`) stamp the full tip (`brushOffsets`). Dedupe indices per stamp with a `Set`. Perf guard: effective orbit cap ≈ `max(64, 20000 / tipCells)` so a 16×16 tip can't combine with a 4096-repeat orbit into 1M writes per pointer event.
- `stampShape`: for square grids + finite modes, map drag endpoints through each `symmetryTransforms` copy and rasterize per copy, stamping the tip along the points (thick, pixel-correct shapes). Repeat/wallpaper modes keep per-point orbit expansion (current path). Non-square grids: extend `expand()` with polar maps (via `grid.angleOf`/`grid.cellByAngle`) for `mirrorX` (θ→−θ), `mirrorY` (θ→π−θ), `quad`, `diag8`; verify these helpers exist for all three lattices, implement if missing.
- Connector: on commit, add mirrored links — for each copy, `link(T(a), T(b))` in cell coords (buffer×sub ÷sub round); live preview shows the mirrored links too.
- Hover overlay: render the real tip footprint (all `brushOffsets` cells at the snapped/free anchor) instead of the single cell; symmetry ghost previews for pencil/eraser (and fill seed). Shape tools already preview the full symmetric result via staging.
- Undo unchanged: whole stroke = one history entry through staging.

Final behavior matrix: pencil/eraser — orbit of anchor × tip; line/rect/ellipse — rasterize per transform copy (+tip along path); fill — flood per orbit seed; connector — mirrored pairs; picker — as today; repeat modes — square-grid only (others fall back to per-point orbits); non-square grids — none/radial/kaleido + new mirror/quad/diag8, wallpaper chips disabled with a hint.

## 5. UI: SettingsPanel + i18n
- Remove the Subcells chips (`SettingsPanel.tsx:640-654`).
- NEW "Brush" section (top of the right panel), built from existing `ui.tsx` primitives (`Section`, `Slider`, `Chip`, `CheckRow`):
  - Size slider 1–16 + quick size chips; live 1:1 tip preview.
  - **Tip editor**: P×P clickable grid to toggle pattern cells; buttons Square/Circle/Diamond/Clear/Invert.
  - Snap checkbox ("Snap to pixel grid, Alt = free").
  - **Presets**: built-in row + user list (mini preview, apply on click, Save current / Overwrite / Rename / Delete), styled after the existing Presets section (`SettingsPanel.tsx:134-174`).
- `[` / `]` hotkeys shrink/grow the brush (`App.tsx` hotkey map, guarded like existing keys).
- i18n: new `brush.*` keys and a `symmetry.squareOnlyHint` in BOTH `src/i18n/en.ts` and `src/i18n/ru.ts`.

## 6. Specs (openspec) + validation
- Update `openspec/specs/sub-cells/spec.md` (global sub-cell detail → legacy for old documents; drawing scale is brush pixel size), `drawing-tools/spec.md` (brush stamping, snap/Alt, shapes use brush), `symmetry/spec.md` (per-tool matrix, shapes re-rasterized per copy, fill/connector symmetric, non-square support matrix).
- Run `npx vitest run`, `npx oxlint`, `npx vite build`; fix fallout.
- Manual checks: 5-cell pixel then 2-cell detail inside it; snap vs Alt; circle tip under quad/diag8/radial (copies must be pixel-perfect); mirrored connectors; hex grid mirror/quad; legacy sub=2 doc loads with detail intact; brush preset round-trip across reload.

## Files
NEW: `src/engine/brush.ts`, `src/engine/brush.test.ts`, `src/storage/brushes.ts`
MODIFIED: `src/engine/symmetry.ts` (+ `.test.ts`), `src/state/store.ts`, `src/components/CanvasStage.tsx`, `src/components/SettingsPanel.tsx`, `src/components/App.tsx` (hotkeys), `src/storage/db.ts`, `src/i18n/en.ts`, `src/i18n/ru.ts`, `openspec/specs/{sub-cells,drawing-tools,symmetry}/spec.md`