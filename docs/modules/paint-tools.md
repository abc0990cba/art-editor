# Paint tools — technical notes

## Scope

The brush model and flood fill: `src/engine/brush.ts` (brush = data), `src/engine/floodfill.ts`
(region fill over any lattice). The stamping loop, symmetry expansion and commit live in the
staging hook ([canvas-stage](canvas-stage.md)); fill patterns live in
[dither-and-patterns](dither-and-patterns.md).

> Naming note: there is **no** `engine/connectivity.ts`. "Connectivity"
> (`Doc.connectivity: 'edge' | 'corner' | 'corner-bridge'`) is a *render-mode setting* for
> outline/metaball modes, covered in [render-outputs](render-outputs.md) and pinned by
> `connectivity.test.ts`.

## Module map

| File | Role |
|---|---|
| `src/engine/brush.ts` | `Brush { size, pattern, shape? }`, built-in tip constructors, `normalizeBrush`, `resizeBrush`, `brushOffsets`, `brushAnchor` |
| `src/engine/floodfill.ts` | `gridTopology`, `floodRegion`, `floodFillDoc` |
| `src/engine/flood-wasm.bench.ts` | TS vs tuned-TS vs Rust-spike comparison (evidence for ADR-0003) |

## How it works

**Brush** (header verbatim): "a pixel size (the tip grid dimension, in buffer cells) plus an
on/off tip pattern. A full square pattern of size N paints exactly an N×N block of cells, so
the brush size *is* the pixel size the user draws with… A brush can also remember the cell
form it draws with; absent shape = follow the current pixel style. Pure data, no React."

- `size` clamps to 1..16 (`MAX_BRUSH`); `pattern` is row-major `boolean[size²]`; an all-empty
  tip falls back to full.
- Eight tip constructors: square, circle (hypot ≤ c+0.25), diamond (manhattan), checker,
  ring, frame, cross, diagonal — `BRUSH_SHAPES` registry, `detectBrushShape` with 'custom'
  fallback, `TIP_MIN_SIZE` per shape (below it the shape degenerates to a full square and is
  not offered).
- `brushAnchor(cellX, cellY, size, snap)`: snapped mode anchors to the containing block of
  the size grid ("size-N pixels tile perfectly — draw at 1/N scale"); free mode centers the
  tip on the cursor.
- `resizeBrush` nearest-neighbor resamples custom tips so they survive size changes.

Stamping: per tip offset `st.cells.set(i, value)` (+ `objs.set(i, PENDING_OBJ)` in element
scope), repeated at every `symmetryPoints` orbit point; the brush's optional cell form feeds
the element style at commit.

**Flood fill**: `gridTopology(doc)` returns the neighbor relation — inline 4-orthogonal for
square buffers, `grid.edgeNeighbors` for every other lattice (hex/triangle/radial cells flood
along shared edges, not dx/dy). `floodRegion` is an iterative stack DFS with a `Uint8Array`
mask (read-only); `floodFillDoc` copies `doc.cells` and writes the region — no-ops when the
start is out of range or already the target value.

## Invariants & constraints

- Brush sizes are buffer-cell units (sub-cells included): a size-5 brush paints 5 buffer
  cells, which is 5 sub-cells at `sub > 1`.
- Tip patterns are size-coupled: `resizeBrush` is the only way to change size without losing
  a custom tip.
- Flood fill never mutates the input doc; callers own the copied buffer.

## Performance characteristics

The shipped `floodFillDoc` allocates a mask plus a per-cell `number[]` inside `neighbors(i)`
— measured at 11.0 ms on a 2048² ~7 % region; a tuned variant (mark-on-push, no mask, no
per-cell arrays) runs 3.1 ms, matching the Rust/WASM spike core (≈3.2 ms). The loss is
algorithmic, not the language — the tuning has not been folded back into `floodfill.ts` yet.
Full story and the WASM gate: [ADR-0003](../decisions/0003-rust-wasm-policy.md),
`flood-wasm.bench.ts`.

Symmetry orbit expansion is capped (`MAX_STAMPS = 20_000` overall; `symmetryPoints(limit)`
short-circuits lattice enumeration — see [symmetry](symmetry.md)).

## Testing

`brush.test.ts` (constructors, normalize, resize, anchors), `floodfill.test.ts` (square +
non-square topologies), `connectivity.test.ts` (the render setting, incl. round trips).

## Related decisions

- [ADR-0003](../decisions/0003-rust-wasm-policy.md) — why flood fill stayed in TypeScript.

## OpenSpec capabilities

- `openspec/specs/drawing-tools/spec.md`

## Known limitations

- `MAX_BRUSH = 16` — no jumbo tips.
- The tuned flood algorithm is bench-only; folding it into `floodfill.ts` is open.
- Flood fill is value-based only — no "fill all layers"/global modes.
