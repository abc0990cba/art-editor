## Two rendering bugs, two root causes (both confirmed in code)

**Bug 1 — old artifacts flash while drawing, canvas corrects on release.**
The canvas stage keeps a persistent 1-px-per-cell preview bitmap (`state.px` in `stage-paint-pixel.util.ts`) used for shape/move/transform previews on pixel-mode docs. Within a stroke it's maintained incrementally, but when the stroke ends the idle branch (`stage-paint-frame.util.ts:64`) only clears its index list (`px.last.length = 0`) — the bitmap itself keeps the last frame's pixels. Any doc change outside a stroke (the FX/pixel-op buttons like 'Убрать шум'/'Силуэт', undo, delete, selection moves) makes that leftover content stale; the next drag blits the whole bitmap over the fresh artwork (`drawFrame` → `drawImage(px.canvas, …)`), so old artifacts appear while the pointer is down and vanish on release (idle repaints fresh geometry without the bitmap).

**Fix 1 (small, surgical):**
- `stage-paint.util.ts`: add a `st: Staging | null` field to the `px` state (the staging session the buffer belongs to).
- `stage-paint-pixel.util.ts`: new `ensureSession(px, st)` helper — when the session differs, wipe the buffer (`u32.fill(0)` + `clearRect` + `last.length = 0`) so u32/canvas stay consistent; call it at the top of `pixelFrame` and `pixelFrameBuf`.
- `stage-paint-frame.util.ts`: idle branch sets `state.px.st = null` (replacing the `px.last.length = 0` line), so the next drag always starts from a wiped buffer.

## Bug 2 — moving an intersecting figure leaves missing pixels

Drawing steals overlapped cells from the object beneath: `commitStroke`/`commitStrokeParametric` call `stealCells` at paint time (`store-internals.util.ts:75,101`), and `moveSelectionScene`/`transformScene` steal the destination footprint (`selection.slice.ts:144-153`, `transform.slice.ts:90-98`). The covered figure permanently loses those cells (only parametric single-color shapes regenerate and self-heal — hence the inconsistency). The composite already paints bottom→top with last-writer-wins (`buildComposite`), so if objects keep their own full ink, overlap just works and moving a figure reveals the one beneath intact.

**Fix 2 — overlap hides instead of destroying (within a layer):**
- `store-internals.util.ts`: remove the paint-time `stealCells` in `commitStroke` and `commitStrokeParametric`. The **eraser stays destructive** (its erase-set steal remains) — it matches the live preview exactly; flag if you want top-figure-only erasing instead.
- `selection.slice.ts`: remove the destination claims/steal block in `moveSelectionScene` (+ unused `stealCells` import), and delete the leftover `console.log('DEBUG store: procedural move for', …)` at line 156.
- `transform.slice.ts`: remove the destination claims/steal in `transformScene` (the bake of the movers themselves stays — scale/rotate remain undoable destructive ops by design).
- Update docstrings/comments to the new rule: within a layer, ink overlaps; composite tree order decides visibility; the eraser is the one destructive tool.

**Tests:**
- Rewrite `scene.test.ts:92` ("painting over steals the cell and GCs the emptied object") → painting over keeps the covered object's ink; composite shows the topmost.
- Add regression tests: two overlapping strokes → `moveSelection` on the top one leaves the bottom figure's cells intact (incl. the former intersection); scaling one of two overlapping blocks doesn't bite the other.

**Docs (per AGENTS.md):**
- Update the scene/layers module doc page with the new ownership rule; record a short ADR for the overlap-semantics decision; grep `openspec/specs` for steal/ownership wording and sync if encoded there.

**Verification:** full chain — `format:check`, `lint`, `arch:check`, `knip`, `tsc --noEmit`, `npm test`; then a manual dev-server pass of both repros (pixel mode: draw → FX op → draw again → no ghosts; two rects → move one → no holes).

**Proposed commits (you commit, I don't):**
1. `fix(canvas): wipe stale pixel-preview buffer between staging sessions`
2. `fix(scene): overlap hides instead of stealing — moving a figure reveals the ones beneath intact`