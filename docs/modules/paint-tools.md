# Paint tools — technical notes

## Scope

The brush model and flood fill in [`src/engine/paint/`](../../src/engine/paint/brush.ts):
[`brush.ts`](../../src/engine/paint/brush.ts) (brush = data) and
[`floodfill.ts`](../../src/engine/paint/floodfill.ts) (region fill over any lattice). The stamping
loop, symmetry expansion and commit live in the staging hook ([canvas-stage](canvas-stage.md)); fill
patterns live in [dither-and-patterns](dither-and-patterns.md).

> Naming note: there is **no** `engine/connectivity.ts`. "Connectivity"
> (`Doc.connectivity: 'edge' | 'corner' | 'corner-bridge'`) is a *render-mode setting* for
> outline/metaball modes, covered in [render-outputs](render-outputs.md) and pinned by
> [`geometry/connectivity.test.ts`](../../src/engine/geometry/connectivity.test.ts).

## Module map

| File | Role |
|---|---|
| [`src/engine/paint/brush.ts`](../../src/engine/paint/brush.ts) | `Brush { size, pattern, shape? }`, 8 built-in tip constructors (`BRUSH_SHAPES`), `normalizeBrush`, `resizeBrush`, `brushOffsets`, `brushAnchor`, `detectBrushShape`, `TIP_MIN_SIZE`, `BUILT_IN_BRUSHES` |
| [`src/engine/paint/floodfill.ts`](../../src/engine/paint/floodfill.ts) | `gridTopology` (internal), `floodRegion`, `floodFillDoc` |
| [`src/engine/paint/tools.bench.ts`](../../src/engine/paint/tools.bench.ts) | tool kernels: `floodFillDoc` (512²/2048²) + `symmetryPoints` ×2000 orbits |
| [`src/engine/paint/flood-wasm.bench.ts`](../../src/engine/paint/flood-wasm.bench.ts) | TS vs tuned-TS vs Rust-spike comparison (evidence for [ADR-0003](../decisions/0003-rust-wasm-policy.md)) |

Tests: [`brush.test.ts`](../../src/engine/paint/brush.test.ts),
[`floodfill.test.ts`](../../src/engine/paint/floodfill.test.ts).

## How it works

**Brush** (header verbatim): "a pixel size (the tip grid dimension, in buffer cells) plus an on/off
tip pattern. A full square pattern of size N paints exactly an N×N block of cells, so the brush size
*is* the pixel size the user draws with… A brush can also remember the cell form it draws with;
absent shape = follow the current pixel style. Pure data, no React."

- `size` clamps to 1..16 (`MAX_BRUSH`); `pattern` is row-major `boolean[size²]`; an all-empty tip
  falls back to full (`normalizeBrush`).
- Eight tip constructors: square, circle (hypot ≤ c+0.25), diamond (manhattan), checker, ring,
  frame, cross, diagonal — the [`BRUSH_SHAPES`](../../src/engine/paint/brush.ts) registry;
  `detectBrushShape` re-derives which built-in a pattern equals ('custom' fallback);
  `TIP_MIN_SIZE` is computed per shape — below it the shape degenerates to a full square and is not
  offered in the pickers.
- `brushAnchor(cellX, cellY, size, snap)`: snapped mode anchors to the containing block of the size
  grid ("size-N pixels tile perfectly — draw at 1/N scale"); free mode centers the tip on the cursor.
- `resizeBrush` nearest-neighbor resamples custom tips so they survive size changes.
- `BUILT_IN_BRUSHES` seeds the brush library (px1–px8 squares, circle 3/5/7, diamond 5, checker 4);
  user brushes persist in IndexedDB ([storage](storage.md), `brushes.slice`).

Stamping (caller side, [`use-canvas-staging.hook.ts`](../../src/features/canvas/use-canvas-staging.hook.ts)):
per `brushOffsets(brush)` tip offset `st.cells.set(i, value)` (+ `objs.set(i, PENDING_OBJ)` in
element scope, `PENDING_OBJ` from [`src/engine/geometry/`](../../src/engine/geometry/index.ts)),
repeated at every `symmetryPoints` orbit point; the brush's optional cell form feeds the element
style at commit.

**Flood fill** ([`floodfill.ts`](../../src/engine/paint/floodfill.ts)), in call order:
`gridTopology(doc)` returns the neighbor relation — inline 4-orthogonal for square buffers
(`bw = cols·sub`), `grid.edgeNeighbors` from [`src/engine/grids/`](../../src/engine/grids/index.ts)
for every other lattice (hex/triangle/radial cells flood along shared edges, not dx/dy).
`floodRegion(doc, start)` is an iterative stack DFS with a `Uint8Array` mask (read-only; mark-on-push
so nothing enters the stack twice) returning the connected same-value indices. `floodFillDoc(doc,
start, value)` copies `doc.cells` and writes the region — no-ops when the start is out of range or
already the target value.

## Data structures

- `Brush { size, pattern, shape? }` — `size` is the tip grid dimension in buffer cells (1..16),
  `pattern` is row-major `boolean[size²]`, and the optional `shape?: CellShapeId` (from
  [`src/engine/cell-shapes/`](../../src/engine/cell-shapes/index.ts)) pins the cell form the brush
  draws with.
- `BrushShapeId = square | circle | diamond | checker | ring | frame | cross | diag` — the built-in
  tip constructors; `BrushDef { id, make }` plus `BUILT_IN_BRUSHES` seed the library UI.
- `TIP_MIN_SIZE: Record<BrushShapeId, number>` — computed once at module load by diffing each
  constructor's pattern against a full square per size.
- Floodfill contracts: `floodRegion → number[]` (region indices, input untouched),
  `floodFillDoc → Uint16Array` (new buffer or the same `doc.cells` on no-op).

## Invariants & constraints

- Brush sizes are buffer-cell units (sub-cells included): a size-5 brush paints 5 buffer cells,
  which is 5 sub-cells at `sub > 1`.
- Tip patterns are size-coupled: `resizeBrush` is the only way to change size without losing a
  custom tip.
- Flood fill never mutates the input doc; callers own the copied buffer.
- Flood fill is value-based over the **whole buffer** (`doc.cells`); the layer-scoped scene variant
  lives in [`state/fill.slice.ts`](../../src/state/fill.slice.ts) (fills never leak through other
  layers' pixels).

## Performance characteristics

The shipped `floodFillDoc` allocates a mask plus a per-cell `number[]` inside `neighbors(i)` —
measured at 11.0 ms on a 2048² ~7 % region; a tuned variant (mark-on-push, no mask, no per-cell
arrays) runs 3.1 ms, matching the Rust/WASM spike core (≈3.2 ms). The loss is algorithmic, not the
language — the tuning has not been folded back into [`floodfill.ts`](../../src/engine/paint/floodfill.ts)
yet. Full story and the WASM gate: [ADR-0003](../decisions/0003-rust-wasm-policy.md),
[`flood-wasm.bench.ts`](../../src/engine/paint/flood-wasm.bench.ts), PERFLOG 2026-09-30
([bench/PERFLOG.md](../../bench/PERFLOG.md)).

Symmetry orbit expansion is capped (`MAX_STAMPS = 20_000` overall; `symmetryPoints(limit)`
short-circuits lattice enumeration — see [symmetry](symmetry.md)).

## Testing

- [`brush.test.ts`](../../src/engine/paint/brush.test.ts) — constructors, `normalizeBrush`,
  `resizeBrush`, `brushAnchor`, shape detection, `TIP_MIN_SIZE`.
- [`floodfill.test.ts`](../../src/engine/paint/floodfill.test.ts) — square + non-square topologies
  (`floodFillDoc`, `floodRegion`).
- [`geometry/connectivity.test.ts`](../../src/engine/geometry/connectivity.test.ts) — the render
  setting (incl. round trips), see the naming note above.

## Related decisions

- [ADR-0003](../decisions/0003-rust-wasm-policy.md) — why flood fill stayed in TypeScript.

## OpenSpec capabilities

- `openspec/specs/drawing-tools/spec.md`

## Known limitations

- `MAX_BRUSH = 16` — no jumbo tips.
- The tuned flood algorithm is bench-only; folding it into `floodfill.ts` is open.
- Flood fill is value-based only — no "fill all layers"/global modes.
