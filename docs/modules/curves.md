# Curves (pen tool) — technical notes

## Scope

The pen tool's editable Bézier paths: the anchor/handle model, cubic flattening and splitting,
pure editing operations, anchor simplification, and rasterization to buffer cells. Everything pure
lives in [`src/engine/curves/`](../../src/engine/curves/index.ts); the on-canvas interaction
(skeleton overlay, anchor/handle dragging, commits) lives in the canvas feature
([canvas-stage](canvas-stage.md)); the committed path stays regenerable through the
`source.bezier` node ([node-graph](node-graph.md)).

## Module map

| File | Role |
|---|---|
| [`src/engine/curves/model.ts`](../../src/engine/curves/model.ts) | `CurveAnchor`/`CurvePath` (absolute doc-space points, `null` handle = straight), `segmentCubic`/`segmentCount`/`segmentEnd`, `clonePath`, SVG-`d` round-trip `pathToD`/`pathFromD`, `emptyPath` |
| [`src/engine/curves/flatten.ts`](../../src/engine/curves/flatten.ts) | `cubicAt` (Bernstein), de Casteljau `splitCubic`, chord-line `flatness`, adaptive `flattenCubic`/`flattenPath` (`FLATTEN_TOL`), `nearestOnSegment` projection |
| [`src/engine/curves/edit.ts`](../../src/engine/curves/edit.ts) | `hitPen` (handle/anchor/segment hit-test), `moveAnchor`, `setHandle` (mirror + Alt-break), `bendSegment`, `insertAnchor`/`deleteAnchor`, `smoothAnchor`/`toggleSmooth`/`smoothAll` (Catmull-Rom tangents), `constrainPoint` (45°/ortho snap) |
| [`src/engine/curves/simplify.ts`](../../src/engine/curves/simplify.ts) | `simplifyPath`: greedy anchor deletion bounded by flattened-curve deviation (`SIMPLIFY_TOL`), endpoints protected |
| [`src/engine/curves/raster.ts`](../../src/engine/curves/raster.ts) | `pathStrokeLine` (Bresenham walk of the flatten), `pathInk` (width-W circle-brush stroke + flood interior as separate sets), `pathCells` (union) |
| [`src/engine/curves/index.ts`](../../src/engine/curves/index.ts) | the facade |

Tests: [`curves.test.ts`](../../src/engine/curves/curves.test.ts) — round-trips, flatten bounds,
editing invariants, simplification guarantees, raster parity (width 1 = the bare center line;
`d`-string round-trip rasterizes identically, the parametric-regeneration invariant).

## How it works

Every consecutive anchor pair is one cubic: a `null` handle collapses onto its anchor and the
segment degrades to a straight line, so corner and smooth points share one representation. The
`d` string serializes straight segments as `L` (preserving the corner/smooth distinction) and
everything else as `C`; the parser folds the duplicate closing anchor of a `Z` path back into the
first anchor.

- **Flattening** subdivides adaptively until both control points sit within `FLATTEN_TOL` (0.2
  cells) of the chord line — the convex hull property guarantees the curve is as flat as its
  controls. Collapsed-handle straights terminate immediately.
- **Rasterization** stamps the pencil's `circleBrush(width)` along the Bresenham center line, so
  pen width N is exactly the pencil's size-N circle tip; closed fills classify the interior by
  exterior flood around the width-1 line (`shapes/fill.ts#regionCells`).
- **Determinism** is load-bearing: `source.bezier` replays `pathCells` from the stored `d` string,
  so a committed parametric curve regenerates exactly the pixels the user previewed (tested).

## Interaction (feature side)

- Draft state: `state/pen.slice.ts` (`pen`, outside undo history; `commitPenReplace` swaps a
  re-edited object in one step).
- Gestures: `features/canvas/use-pen-tool.hook.ts` + `use-pen-actions.hook.ts` (click = corner,
  drag = smooth point, handle/anchor/segment dragging, first-anchor close, double-click
  insert/toggle/re-enter, Enter commit, Escape cancel).
- Overlay: `features/canvas/stage-pen.util.ts` (`drawPenOverlay` skeleton, `penGridInk` lattice
  sampling); the pixel preview stages through the shared staging buffer, so what you see is what
  commits.
- Styling reuses the shape tools' `ShapePaint` (fill/stroke/align colors) plus `penWidth` and
  `penSnap` in `ToolOpts`; the panel section is `features/tools/tool-settings-pen.component.tsx`.
- Parametric commits are square-grid + no-symmetry only (mirroring the shape tools); lattice
  grids and symmetric ink commit as plain pixels.

## Invariants

- Engine purity: `curves/` imports only `paint`, `shapes` (ADR-0001).
- Paths are immutable — every edit returns a fresh `CurvePath`.
- One committed path = one object = one undo step, like every stroke.
