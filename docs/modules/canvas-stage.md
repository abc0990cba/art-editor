# Canvas stage — technical notes

## Scope

`src/features/canvas/`: the render surface and all pointer interaction — the two-canvas
stage (`canvas-stage.component.tsx`, ~1260 lines), the stroke staging hook
(`use-canvas-staging.hook.ts`, ~875), the view/navigation hook (`use-canvas-view.hook.ts`),
selection UI (actions bar, FX menu, warp popover, transform hook),
hit-testing/marquee/coordinate utils, and the scrollbars. Engine-side
rendering it consumes: [geometry](geometry.md), [render-pipeline](../architecture/render-pipeline.md).

## Module map

| File | Role |
|---|---|
| [`src/features/canvas/canvas-stage.component.tsx`](../../src/features/canvas/canvas-stage.component.tsx) | base + overlay canvases, pointer tools, grid overlay, effects wiring |
| [`src/features/canvas/use-canvas-view.hook.ts`](../../src/features/canvas/use-canvas-view.hook.ts) | view navigation: wheel/pinch zoom, pan inputs, view keys (`use-canvas-view`) |
| [`src/shared/lib/canvas-view-math.util.ts`](../../src/shared/lib/canvas-view-math.util.ts) | pure view math shared by all zoomable viewports: deltaMode normalization, anchored zoom + clamps, offscreen test |
| [`src/features/canvas/use-canvas-staging.hook.ts`](../../src/features/canvas/use-canvas-staging.hook.ts) | staging state, rAF loop, symmetry/shape stamping, commit |
| [`src/features/canvas/canvas-stage.util.ts`](../../src/features/canvas/canvas-stage.util.ts) | `MAX_STAMPS`, `sizeCanvas` (dpr), `blobCells` cache, marquee/label utils |
| [`src/features/canvas/use-selection-transform.hook.ts`](../../src/features/canvas/use-selection-transform.hook.ts) | scale/rotate/flip handle interaction |
| [`src/features/canvas/select-hit.util.ts`](../../src/features/canvas/select-hit.util.ts) | click → selection ids (outermost group = click unit) |
| `src/features/canvas/selection-actions / -fx-menu / -warp-popover` | floating selection UI |

## How it works

**Where the pixels come from.** Everything painted here is engine output: `buildGeometry`
turns the doc into `StyledPath[]` and `drawGeometry` (from
[`src/engine/output/png.ts`](../../src/engine/output/png.ts)) paints it — the full dispatch → draw story lives in
[render-pipeline](../architecture/render-pipeline.md), the geometry side in
[geometry](geometry.md). This page covers the feature side: canvases, staging, view state.

**Two canvases.** The base canvas (background, artwork, grid) receives pointer events; the
overlay canvas (`pointer-events-none`) draws symmetry guides, marching ants, transform box,
marquee, hover ghost. Both are dpr-sized by `sizeCanvas`.

**Committed rendering.** `const geometry = useMemo(() => buildGeometry(doc), [doc])`
("committed geometry only: during strokes the base layer composites the staged delta on top
of a cached artwork bitmap… so the full-document rebuild runs on doc changes — not on every
rAF tick of a stroke"). An offscreen artwork bitmap (`artLayerRef`) is keyed on
geometry+zoom+pan+size+dpr and rebuilt only when one changes.

**Staging.** Strokes mutate a staging delta (cells/links/objs maps) — never the doc; a
coalescing rAF loop calls `drawBaseRef`/`drawOverlayRef` directly ("staging mutations coalesce
into at most one direct draw per frame — React renders only when the stroke commits"). The
base-canvas frame itself is dispatched in
[`stage-paint-frame.util.ts`](../../src/features/canvas/stage-paint-frame.util.ts) (with the
`stage-paint-*.util` siblings): per frame, `stagingPreview` (O(staged)) when eligible — blit
art → punch erases with `destination-out` → repaint background with `destination-over`
("skipping it flashes the flat app background in place of the checkerboard") → draw preview
paths; otherwise the fallback full `buildGeometry(doc, st)` — the fallback cliff, which since
2026-10-03 only remains for connector edits and non-square grids (textured/outline/metaball docs
preview as plain fragments under the plain-until-release contract; shape drags stage into a
pooled typed buffer read by the pixel preview directly). The pixel preview bitmap belongs to
one staging session: a new session wipes it (`ensureSession`), so edits that happen between
drags (pixel ops, undo, moves) can never blit stale pixels into the next preview.
`commitStaging` produces one undoable step via `paintCells`/`paintCellsValues`; in element
scope the fresh shape selects itself (Illustrator-style). Window-level
pointerup/pointercancel/blur finish drags "so a lost pointerup can never turn later hover
moves into stray stamps".

**Zoom/pan.** Navigation lives in `use-canvas-view.hook.ts` over the pure math in
`shared/lib/canvas-view-math.util.ts` (`anchoredZoom` clamps 0.5..80 and keeps the doc point under the
cursor fixed; the same math serves every zoomable viewport — previews, node editor, SVG studio —
via the shared `use-wheel-zoom`/`use-pinch-zoom` hooks). Wheel = zoom, cursor-anchored; `wheelDeltaPx`
normalizes line/page `deltaMode`
(a line-mode notch is ×16) and `ctrlKey` wheel (trackpad pinch) gets a stiffer curve;
Shift+wheel or a horizontal-dominant `deltaX` pans horizontally. Pan inputs: middle button,
right button (context menu suppressed over the wrap), held Space, and the hand tool (H;
Shift+H stays the heart shape). Plain `+`/`−` step zoom ×1.25 around the center, `0` = 100% —
deliberately plain keys: Cmd/Ctrl plus/minus/zero belong to the browser's page zoom. Touch:
two fingers pinch/pan (Procreate-style). `fit()` = min scale ×0.88 centered, re-run on
`fitSignal` and first mount; the wrap's `ResizeObserver` also refits when a resize (browser
zoom, panel toggle) leaves the artwork fully outside the viewport — never mid-gesture.
Measured cost: 2.5–4.9 ms per wheel step — not a bottleneck (research §7).

**Grid overlay.** Square-grid lines are prebuilt `Path2D`s in a useMemo ("up to ~3000
moveTo/lineTo segments per direction on a 500×500 grid are far too costly to rebuild on every
rendered frame"); non-square grids rebuild a polygon overlay per doc change; grid strokes only
at zoom ≥ 4. Checkerboard = repeating 1-unit pattern, O(1) regardless of canvas size.

**Selection.** `useOutlineCache` caches marching-squares contours per doc; the ants rAF loop
runs only while a selection exists and `prefers-reduced-motion` is off (dash phase wraps at
60 s). Selection actions (duplicate/flips/90°/delete), the grouped FX menu (warp presets with
live-preview popovers, stylize ops) and the transform box clamp into the viewport. Marquee
coalesces through its own rAF.

**Scrollbars.** Pure metrics from
[`src/engine/core/scrollbars.ts`](../../src/engine/core/scrollbars.ts) (`{ visible, scale, thumbLen,
thumbPos }`, min thumb 28 px) rendered as 10 px DOM overlays; thumb-drag pans, track click
jumps; each axis shrinks by the other bar when both are visible.

## Invariants & constraints

- No `React.memo` anywhere under `features/canvas/` — the perf strategy is imperative refs +
  rAF coalescing + the cached artwork bitmap, not memoization. Hover updates are throttled by
  value comparison ("a fresh object here re-renders the whole stage on every move").
- Stamp budget: `MAX_STAMPS = 20_000` caps orbit × tip enumeration per frame
  ([symmetry](symmetry.md)).
- Escape cancels transform, pending link, staging and selection — one hook owns it.
- Erase staging in scene docs routes to the composite owner's layer (honest previews).

## Performance characteristics

- Commit 4096² = 116–190 ms browser-side (composite + geometry + art bitmap) — the tile
  model is the planned lever (`docs/research/performance.md` §4, §7).
- Idle-with-selection redraws the full overlay per rAF (ants + scratch passes) — measured
  cadence-bound only; cheap fixes recorded (minimal ants redraw, pause when occluded).
- Hover crossing a cell boundary re-renders the whole stage — known reconcile waste, fix
  recorded (P4).

## Testing

Staging/commit behavior is covered by engine integration tests lifted through the store
([`src/engine/perf-stress.test.ts`](../../src/engine/perf-stress.test.ts) ratchets,
[geometry tests](../../src/engine/geometry/geometry.test.ts)); the browser harness
(`?bench=1`) drives the real CanvasStage — note the harness is a separate entry
(`app/main.tsx` → `app/bench/bench-main.tsx`), **not** hooks inside this component.

## Related decisions

- [ADR-0002](../decisions/0002-canvas2d-rendering-webgpu-deferred.md); [ADR-0005](../decisions/0005-zustand-single-store.md).

## OpenSpec capabilities

- `openspec/specs/drawing-tools/spec.md`, `openspec/specs/canvas-grid/spec.md`; in-flight
  `openspec/changes/add-canvas-scrollbars/`.

## Known limitations

- No React.memo (see above) — hover/marquee still cause full-stage re-renders (roadmap P4).
- Commit path renders the full art bitmap; the dirty-tile geometry cache (2026-10-03,
  `engine/geometry/tiles.ts`) already re-emits only changed tiles — per-tile art canvases are
  the remaining lever (roadmap P1 remainder).
- Vector/gradient workspaces have their own preview surfaces; this doc covers the pixel stage.
