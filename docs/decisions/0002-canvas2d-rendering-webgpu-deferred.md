# ADR-0002 — Canvas2D rendering; WebGL/WebGPU deferred

- Status: accepted
- Date: 2026-10-01 (WebGPU deferral recorded in PERFLOG M5, 2026-09)
- Related: [render-pipeline](../architecture/render-pipeline.md); [render-outputs](../modules/render-outputs.md); `bench/PERFLOG.md` M2a/M5; [research/performance.md](../research/performance.md) §8

## Context

The pixel canvas must redraw on every commit, pan and zoom, up to the 4096² canvas cap, while
SVG export must produce byte-identical *geometry* to what the preview shows. Candidate
technologies: Canvas2D with cached `Path2D`s, WebGL, WebGPU. Measurements were needed, not
taste: zoom/pan was suspected as the bottleneck and GPU raster as the fix.

## Decision

Render with **Canvas2D**: `drawGeometry(ctx, paths)` fills cached `Path2D` objects with the
**evenodd** fill rule (load-bearing: texture holes, outline bridge overlays, metaball loops
are subpaths). Paths are cached by their string with a 32 M-char FIFO budget — geometry
rebuilds emit identical strings, so equal strings are the same path by construction. The same
`StyledPath[]` feeds the SVG exporter, guaranteeing preview/export identity by construction
rather than by testing.

WebGPU (and WebGL) stay **out** of the codebase. PERFLOG M5 measured zoom effects at 3–4 ms
on Canvas2D and concluded raster is not the residue; the deferral stands until the tile data
model lands and live-frame profiles show paint as a cost.

## Alternatives considered

- **WebGL/WebGPU raster** — rejected for now: measured zoom effects are already inside the
  frame budget; a GPU path would fork the geometry semantics (evenodd subpath holes, stroke
  joins) and break the single-pipeline guarantee for a benefit no profile has shown.
- **Bitmap blitting of pre-rendered cells** — rejected: pixel styles (rounded corners, cell
  forms, metaball) are vector-native; bitmap caching exists at a smaller scale (the committed
  artwork bitmap in `canvas-stage`), invalidated by geometry+view keys.
- **DOM/SVG as the live preview** — rejected: per-frame path churn in the DOM is slower and
  unmeasurable; SVG is produced only for export.

## Consequences

- Preview and SVG share one geometry pipeline; there is no "render vs export" divergence bug
  class (metaball contours come from marching squares over the scalar field, not SVG filters).
- The path-string interchange format is a deliberate hot-path cost — string building dominates
  per-cell style costs (see `style-decompose.bench.ts`: fragment machinery, not string
  formatting, dominates; stadium-per-run emulation is 33× cheaper than per-cell circles).
- Evenodd is contractual: consumers must emit holes/overlays as subpaths of the same path
  (or, for bridge overlays, as a *separate* same-color path — merging it in would cancel the
  area under evenodd).

## Evidence

- `src/engine/png.ts` header — path-string cache rationale + `PATH_CACHE_BUDGET`.
- `bench/PERFLOG.md` M2a (RLE run merging, −39 %…−99 % buildGeometry), M5 (WebGPU deferred).
- `docs/research/performance.md` §7 — "Zoom/pan is NOT a bottleneck"; §8 W5 — "WebGPU stays
  deferred".
