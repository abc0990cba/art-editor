# Pen tool (Bézier) for the pixel canvas — Illustrator/Inkscape-style

## What we're building

A full pen tool for the pixel editor: click = straight segment (corner anchor), click-drag = smooth anchor with mirrored handles; on-canvas editing of anchors and control handles while drafting; angle snapping; stroke width; fill for closed paths; auto-smooth; anchor simplification. Committed paths stay **re-editable**: they're saved as parametric `source.bezier` objects (like rect/ellipse today), and double-clicking one with the Pen tool reopens the draft with all anchors/handles.

Interaction model (AI/Inkscape conventions, adapted to existing repo modifiers):
- Click = corner anchor + straight rubber band; **click-drag** = smooth anchor (drag out mirrored handles); click the first anchor (or press Enter) with ≥2 anchors → close path; **Enter** = commit; **Escape** = cancel draft; switching tools auto-commits.
- Drag anchor = move it; drag a handle = reshape (Alt breaks mirror, Ctrl snaps handle to 15°); drag a segment = bend it (moves adjacent handles proportionally); double-click anchor = toggle smooth/corner; Delete/Backspace = remove selected anchor.
- **Shift** always snaps segment angle to 45° steps; sticky chips: Free / 45° / Ortho(H/V).
- Panel options (tool settings popover): stroke width slider 1–10 cells, angle-snap chips, fill chips (Stroke / Fill / Both — fill only for closed), action buttons (Close path, Smooth all, Simplify), shortcut hints.
- Hotkey `f` (p is taken by drop); pen icon + rail position after `line`; i18n en+ru.

## Key architecture decisions

1. **Pure engine domain `src/engine/curves/`** (facade `index.ts`, per repo convention; engine imports nothing above itself):
   - `model.ts` — `CurveAnchor { x, y, hIn, hOut }`, `CurvePath { anchors, closed }` (absolute doc-space points), SVG-`d` serialize/parse (`pathToD`/`pathFromD`) — the `d` string is what gets stored in the parametric node params.
   - `flatten.ts` — de Casteljau cubic evaluation, adaptive flattening (angle tolerance), cubic splitting (`splitCubic`) for anchor insertion, nearest-segment-with-t lookup.
   - `edit.ts` — pure editing ops: hit-test anchor/handle/segment with doc-units tolerance, move anchor/handle, mirror/break handles, toggle smooth↔corner, `smoothAll` (Catmull-Rom→Bézier), `deleteAnchor`, `insertAnchorOnSegment`.
   - `simplify.ts` — error-bounded anchor reduction (Ramer–Douglas–Peucker on flattened points + handle re-fit; self-contained, no import from `trace/` per the engine DAG).
   - `raster.ts` — path → integer cells: flatten → `polylineCells` (from `shapes/lines.ts`) for width 1; width dilation by stamping disk/square offsets per flattened point for width > 1; closed-path fill via `shapes/fill.ts` (`fillCellsEvenOdd`/`regionCells`). Deterministic — same input always yields identical cells.
   - Colocated `curves.test.ts` (flatten bounds, split round-trip, smooth/simplify invariants, raster parity with polylineCells at width 1, closed-fill agreement, `d` round-trip).
2. **Draft state = new UI slice `src/state/pen.slice.ts`** (`pen: { path, selectedAnchor } | null` + actions) — outside history (like selection), composed into `editor.store.ts`. Tool options go into `ToolOpts`/`DEFAULT_TOOL_OPTS` in `tools.slice.ts`: `penWidth`, `penSnap`, `penFill` (chips render in the settings popover).
3. **Canvas integration without growing ratchet-locked files**: new `src/features/canvas/use-pen-tool.hook.ts` (the interaction brain: hit-priority pointerdown → handle > anchor > first-anchor-close > segment-bend > add-anchor; drag refs, snap, rAF overlay redraw) and `src/features/canvas/stage-pen.util.ts` (overlay drawing on the existing overlay canvas: path outline, anchor squares, handle stems+knobs, hover/rubber band; screen-constant sizes via `1/zoom`, touch hit radii doubled, theme colors from `STAGE_THEMES` — canvas-drawn, no raw hex in JSX). `canvas-stage.component.tsx` is at its lint cap, so I'll offset the few delegation lines (pen branches in pointerdown/move, overlay call, new `onDoubleClick`) by extracting the connector `pendingLink` two-click block into `canvas-stage.util.ts`, keeping net growth within the ratchet.
4. **Commit + re-edit**: commit rasterizes the draft into `st.cells`-style map → `paintCellsValues(..., parametric: { op: 'bezier', params: { d, w, fill, closed } })` → one undoable object on the active layer. New `source.bezier` op in `engine/nodes/sources.node.ts` regenerates identical cells from params (parity test included). Re-edit: double-click (or click) with pen over an object whose source is `bezier` → `pathFromD(params.d)` → draft reopens; commit replaces the object in the same history step via a replace-variant of `commitStrokeParametric` in `state/store-internals.util.ts`. Non-square grids follow the same `grid.cellAt` sampling the shape tools use.
5. **Wiring**: `Tool` union += `'pen'`; icon + `toolKeys` in `tool-icons.component.tsx`; hotkey map in `use-hotkeys.hook.ts` (`f`); pen section in `tool-settings-body.component.tsx` (+ small branch in `tool-preview.component.tsx`); i18n keys in both dictionaries; `docs/architecture/engine-map.md` registration (table + DAG) + `docs/modules/curves.md` module page; OpenSpec delta on the drawing-tools capability (change `add-pen-tool`, archived at the end).

Note: the working tree has the previous session's uncommitted scene/steal fixes — I'll stay additive and won't entangle those files' semantics.

## Order of work

1. `engine/curves/` domain + tests → gates green.
2. `pen.slice.ts` + `ToolOpts` additions + store composition.
3. Overlay drawing (`stage-pen.util.ts`) + interaction hook; canvas-stage delegation (+ connector extraction); double-click wiring.
4. Commit path: `source.bezier` node op, parametric commit + replace variant, re-edit loading.
5. Settings UI (width/snap/fill/actions), tool icon, hotkey, i18n, preview branch.
6. Simplify/smooth automation buttons + parity tests for node regeneration.
7. Docs (engine-map, curves.md, ADR not needed — no new durable tech), OpenSpec change, design-review pass on the UI.
8. Full gate chain: `format:check`, `lint`, `arch:check`, `knip`, `tsc --noEmit`, `npm test`; manual dev-server pass (draw curve → edit handles → Enter → double-click re-edit → re-commit).

All new files stay under the 400-line / 150-line-per-function ratchets by splitting per concern as listed above.

## Proposed commits (you commit, I don't)

1. `feat(engine): curves domain — bezier model, flatten, edit ops, rasterizer`
2. `feat(pen): bezier pen tool with on-canvas anchor/handle editing`
3. `feat(pen): re-editable parametric bezier objects; snap, smooth and simplify automation`
4. `docs(curves): engine-map + module page and openspec change for the pen tool`