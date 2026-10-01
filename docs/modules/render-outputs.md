# Render outputs — technical notes

## Scope

Consumers of `StyledPath[]`: the Canvas2D painter and PNG rasterizer (`src/engine/png.ts`),
the SVG exporter (`src/engine/svg.ts`), and the silhouette modes they draw — outline tracing
(`outline.ts`) over marching squares (`marching-squares.ts`), with shared path helpers
(`poly-path.ts`). The export popover UI (`src/features/export/`) is covered at the end.

## Module map

| File | Role |
|---|---|
| `src/engine/png.ts` | `drawGeometry` (Path2D cache), `renderPng`, `renderThumbnailDataURL`, `autoPngSize` |
| `src/engine/svg.ts` | `buildSvg(doc, { includeBg, scale? })` — flat path list |
| `src/engine/marching-squares.ts` | `marchingSquares(field, fw, fh, iso) → Pt[][]` |
| `src/engine/outline.ts` | `outlineGeometry` — exact cell-edge silhouette + per-corner fillets |
| `src/engine/poly-path.ts` | `roundedPolygonPath`, `fmt` — shared fillet helpers |

## How it works

**Canvas painting.** `drawGeometry(ctx, paths)` looks up each path string in a `Map<string,
Path2D>` cache (32 M-char FIFO budget; equal strings are the same path by construction —
see the header comment and [ADR-0002](../decisions/0002-canvas2d-rendering-webgpu-deferred.md)),
then fills with `ctx.fill(path, 'evenodd')` or strokes (`lineWidth = strokeWidth ?? 0.3`,
round caps). The caller pre-scales the context so 1 unit = 1 doc unit.

**PNG.** `renderPng(doc, {width, height}, includeBg)` rasterizes onto a canvas capped at
`MAX_PNG_SIDE = 5000` per side (auto size = 8 px/cell); `renderThumbnailDataURL` (max side
320) always paints the background and feeds library cards and presets.

**SVG.** `buildSvg` emits `<svg viewBox="0 0 w h">` (doc units), optional background rect,
then one `<path d fill fill-rule="evenodd">` per StyledPath — no groups, no defs, numbers at
3 decimals. Default scale is 10 px/cell. Because it consumes the same geometry as the canvas,
the exported vector is exactly the preview — including metaball contours, which are traced
from the scalar field rather than produced by SVG filters.

**Outline mode** (`outline.ts` header): same-color cells connected by an edge form one
silhouette traced exactly along cell edges; every 90° corner gets a circular fillet sized by
the corner-radius setting (chamfer variant: 45° cuts). Per color: a binary field with a
zero-padding ring, traced at `iso = joinCorners ? 0.49 : 0.5` — the 0.49 makes the saddle
average count as inside so corner-touching cells join into one pinched silhouette.
`simplifyLoop` restores true 90° corners (each binary-field diagonal is split into two
half-cell legs through the corner point); `emitFilletPath` fillets with convexity decided per
loop by majority turn sign, radii clamped to half the adjacent edge lengths.
`connectivity: 'corner-bridge'` adds one diamond overlay per diagonal junction as a
**separate same-color path** — inside the silhouette path its area would cancel under evenodd.

**Marching squares** (`marching-squares.ts`): 16-case segment table over a `Float32Array`
field; saddles resolved by center average; edge crossings linearly interpolated and shared
through a lazy `Map<edgeId, Pt>` (adjacent cells reference the exact same coordinates);
segments stitched into closed loops, open chains dropped. No rounding here — consumers fillet.

## Data structures

- `SvgOptions { includeBg: boolean; scale?: number }` — the only export knobs.
- `Contour`/loop points are field-node coordinates; consumers scale to doc units
  (`1/(sub·q)` for metaball, `1/sub` per outline leg).

## Invariants & constraints

- Evenodd everywhere: `fill-rule="evenodd"` is hardcoded per `<path>`; texture holes and
  nested loops depend on it.
- `squareEdges` zeroes fillet radius for border-facing corners (`keepCorner`).
- PNG side cap 5000; zoom-clamped contexts are the caller's business.

## Performance characteristics

- Outline rebuild at 2048²: 722 ms (`render-modes.bench.ts`) — it is one of the modes with no
  O(staged) preview (the fallback cliff). Metaball is cheap (kernel radius ≈ 1 cell at
  default strength).
- `Path2D` cache budget bounds memory by cached characters, not path count.

## Testing

`marching-squares` behavior is pinned via `geometry.test.ts` outline cases;
`connectivity.test.ts` covers corner/bridge render + serialization round trips; export shapes
are exercised in engine tests through `buildSvg`/`renderPng` (node canvas) and in
`export-popover` interactions.

## Related decisions

- [ADR-0002](../decisions/0002-canvas2d-rendering-webgpu-deferred.md).

## OpenSpec capabilities

- `openspec/specs/export/spec.md`, `openspec/specs/pixel-styling/spec.md` (outline mode),
  `openspec/specs/metaball-rendering/spec.md`

## Known limitations

- PNG render is synchronous on the main thread (up to 5000 px); OffscreenCanvas-in-worker is
  the planned adoption point (research W3).
- SVG has no `<defs>`/gradients — the gradient workspace composes its own AI-safe SVG
  separately ([gradient-workspace](gradient-workspace.md)).
