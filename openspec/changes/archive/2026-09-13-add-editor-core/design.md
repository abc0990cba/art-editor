# Design: add-editor-core

## Architecture

Three layers, dependencies pointing downward only:

```
components/ (React + Tailwind)
   ↓ uses
state/ (zustand store + zundo temporal history)
   ↓ uses
engine/ (pure TypeScript, no React, fully unit-tested)
```

The engine is the heart. Everything visual is derived from one function:

```
buildGeometry(doc: Doc, extra?: staging overlay) → Geometry { paths: {d, fill}[] }
```

The canvas stage renders `paths` via `Path2D`; the SVG exporter serializes the same `paths`.
Preview and export are identical by construction (spec: metaball-rendering / Shared geometry
pipeline).

## Document model

`Doc` (in `engine/doc.ts`): `cols/rows` (1–100), `sub` (1|2|3), `cells: Uint16Array` of
`cols*sub × rows*sub` (0 = empty, v ≥ 1 → `palette[v-1]`), `links: Link[]` (connectors in pixel
coordinates), `palette`, `style` (radius, per-corner overrides, sizeX/sizeY), `metaball`
(enabled, strength, perColor, quality), `bg`, `connectorWidth`.

The undoable slice is exactly `Doc`; UI state (tool, colors, zoom, pan, symmetry, language,
staging) lives outside history.

## Geometry engine

- **Shape mode** (metaball off): each non-empty cell → rounded-rect path centered in its cell box
  (box side = `1/sub`), inset by `sizeX/sizeY`, radii = per-corner fraction × min(boxW, boxH).
  Paths are grouped per color into one compound path each (`evenodd`).
- **Metaball mode**: scalar field over the buffer at `quality` samples/cell (capped so the field
  stays ≤ ~600 on the long side). Each painted cell adds a Wyvill kernel
  `f = (1 - d²/R²)³` (d ≤ R) with `R = halfCell × (1 + strength/100 × 1.2)`; connectors add
  capsule kernels (distance to segment). Per-color grouping when `perColor` is on: one field per
  color, contours per field, drawn in first-appearance order.
- **Marching squares** with linear edge interpolation; saddle cases resolved by field average;
  segments joined into closed loops via edge-identity keys; loops smoothed with midpoint
  quadratic Béziers; emitted with `fill-rule="evenodd"` so holes survive.
- **Connectors** render as capsules both in shape mode (round-capped stroke path) and metaball
  field (capsule kernels).
- Sub-cells are just buffer cells at `1/sub` box size — no special casing beyond box size.

Performance: geometry recomputes only on doc/staging change; staging (in-stroke preview) merges
into a scratch buffer copy; during drags recompute is rAF-throttled. Worst case (100×100, sub 3,
quality 4 → capped field) stays interactive; quality "low" is the escape hatch.

## Symmetry

Pure function `symmetryPoints(x, y, bw, bh, mode, n) → [x,y][]` mapping buffer coordinates:
mirrors reflect around the center axis; radial rotates around the buffer center with rounding,
out-of-bounds results are dropped; kaleidoscope = radial + mirrored radial. Applied to every
stamped point of pencil/eraser/shapes/connector before buffer writes; fill and eyedropper bypass
it. Guides are a viewport overlay only.

## Tools and staging

Drag previews never mutate `Doc`. The stage accumulates `staging: { cell: value-1-based map }` or
shape points; `buildGeometry(doc, staging)` renders doc ∪ staging. On pointer-up one action
commits staging into `cells` (one undo step). Connector = two clicks; preview capsule follows the
pointer after the first click. Eraser removes connectors within a capsule-distance hit test.

## State

`zustand` store; `zundo` temporal middleware with `partialize` restricted to `doc`, limit 100.
Mutating actions wrap zundo's `commit`-friendly updates (new `cells` array per mutation — buffers
are replaced, never mutated in place, so undo snapshots are safe).

## Export and persistence

- SVG: `<svg viewBox="0 0 cols rows">` + optional bg `<rect>` + engine paths (numbers → 3
  decimals). Downloaded via Blob.
- PNG: offscreen canvas at `scale × cols`, draw engine paths, `toBlob`.
- Project JSON: versioned `{ v: 1, ...doc, cells: Array }`; loader validates ranges and rebuilds
  typed arrays.
- Autosave: debounced (800 ms) `localStorage` write of the same JSON; restored on boot, wrapped in
  try/catch.

## i18n

Typed dictionary module: `en.ts` defines the shape, `ru.ts` must satisfy it; `I18nProvider`
context + `useT()` hook. Language persisted in localStorage. No runtime dependency.

## Testing

vitest over the engine only: symmetry mappings, marching-squares loop closure on synthetic fields,
geometry parity (shape-mode path output contains expected cell boxes), metaball merge (two cells →
one contour), SVG serialization, JSON round trip, flood fill, resize/sub-change preservation.

## Trade-offs

- Canvas 2D over WebGL: 100×100 with capped fields is fast enough; much simpler.
- Real contour extraction over SVG-filter gooey: filters would blur colors together and export as
  non-portable filter chains; contours give true vectors.
- Staging overlay instead of history-throttling: simpler, guarantees one undo step per stroke.
