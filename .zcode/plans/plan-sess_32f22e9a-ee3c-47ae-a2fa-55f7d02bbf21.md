# Gesture zoom in all canvas spaces

**Goal:** pinch/wheel zoom works everywhere like it does in pixel space. Root causes found:

1. **Passive React `onWheel`** — React 19 registers wheel listeners passively, so `preventDefault()` is a no-op. Trackpad pinch (ctrl+wheel) **page-zooms the browser** instead of the canvas in the tracer/gradient viewport (`pan-zoom-preview.component.tsx:82`) and the nodes editor (`node-editor-canvas.component.tsx:468`). The pixel canvas works because it uses a native non-passive listener.
2. **No trackpad-pinch rate curve** outside the pixel canvas (`canvas-view-math.util.ts` `PINCH_RATE` vs `WHEEL_RATE`) — only the pixel canvas distinguishes `e.ctrlKey`.
3. **`transition duration-300`** on `PanZoomPreview`'s transformed layer animates every pinch frame → the tracer/gradient artwork rubber-bands behind the fingers on phones.
4. **Compare-divider handle swallows pointers** (`stopPropagation` + the pinch hook ignores button-origin presses) → a pinch never starts if one finger lands on the handle.
5. **Import before/after and SVG studio have no camera at all** (and their `touch-none` blocks even native browser pinch).

## Changes

### 1. Shared foundation
- **Move** `features/canvas/canvas-view-math.util.ts` + its test → `shared/lib/` (shared can't import features; features→shared is allowed). Update imports in `use-canvas-view.hook.ts` / `canvas-stage.component.tsx`. Extend `anchoredZoom(view, target, ax, ay, min = ZOOM_MIN, max = ZOOM_MAX)` with optional clamp bounds; cover them in the moved test.
- **New `shared/ui/use-wheel-zoom.hook.ts`** — one native `{ passive: false }` wheel listener: deltaMode normalization, ctrl+wheel pinch rate, horizontal-wheel/shift pan, cursor-anchored zoom via the shared math. API `{ target, getView: () => V, applyView: (v: V) => void, minZoom, maxZoom }` with `V extends CanvasView` — ref-based so it fits both `useState` viewports and split zoom/pan state. The pixel canvas keeps its own (working) wiring untouched.

### 2. Tracer + gradient (PanZoomPreview)
- `pan-zoom-preview.component.tsx`: replace React `onWheel` with `useWheelZoom` (bounds 0.05–64); narrow `transition duration-300` → `transition-opacity duration-300` (gestures become instant, busy fade stays).
- `use-pinch-pan.hook.ts`: button-origin pointers are recorded (so pinch starts anywhere) but never pan and never get pointer-captured — plates and the divider handle keep working; the surviving-finger pan handoff skips them.
- `compare-split.component.tsx`: drop `stopPropagation()` in the handle's `onPointerDown`.

### 3. Nodes editor
- `node-editor-canvas.component.tsx`: drop the stepped React `onWheel`, wire `useWheelZoom` against the existing `zoomRef`/`panRef` (clamp 0.25–2). Touch pinch already works — untouched. Net-negative lines (file is ratchet-capped at 1235).

### 4. Import before/after (tracer-style, per your answer)
- Rebuild `before-after-preview.component.tsx` on `PanZoomPreview` + `CompareSplit` (like `VectorPreview`): one camera, wheel/pinch zoom, drag pans, divider moves by handle + arrow keys; badges → `overlay`; canvases at document pixels (result geometry `cols×sub × rows×sub`, bitmap size before first result), `pixelated` result side; drop the dialog's checkerboard prop (same recipe built in). Update `import-dialog.component.tsx` mounting.

### 5. SVG studio
- `svgart-stage.component.tsx`: add `{zoom,x,y}` view state as a CSS transform on the stage box; `useWheelZoom` (clamp 0.5–8); capture-phase two-finger pinch on the host that cancels an in-progress shape drag; `ZoomControls` + fit plate bottom corners (reuse `'view.fit'` label — no new i18n keys).
- `use-stage-drag.hook.ts`: expose `cancelDrag()`, accept `viewZoom`; scale-dependent constants stay screen-correct (`14/(fitScale·zoom)` hit tolerance, `8/(fitScale·zoom)` snap tolerance, marquee min-size).
- Overlay counter-scaling: stroke widths/dash arrays ÷ (`fitScale·zoom`), knobs/ticks get `scale(1/zoom)`. `toScene` needs no change (rect-ratio mapping is transform-invariant).

Glyph editor grid stays as is (it wasn't in the chosen scope).

## Verification
- Full gate: `format:check`, `lint` (watch the node-editor ratchet cap), `arch:check` (shared/lib move), `knip`, `tsc --noEmit`, `npm test`.
- Manual matrix via `npm run dev`: trackpad pinch must not page-zoom the browser on tracer/gradient/nodes/svgart; phone pinch on the tracer incl. one finger on the divider handle; import dialog compare; cursor-anchored wheel everywhere; plates still clickable. Run the design-review skill after the code gate.
- Check `docs/modules/vectorizer.md`, `svgart.md`, `image-import.md` for stale gesture descriptions.

Commit message proposal (you commit): `fix(ui): gesture zoom parity across canvas spaces` with a body listing the passive-wheel fix, pinch-rate curve adoption, transition/handle fixes, and the two new cameras.