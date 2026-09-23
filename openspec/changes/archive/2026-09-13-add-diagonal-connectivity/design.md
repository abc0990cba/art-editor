# Design: add-diagonal-connectivity

## Setting

`Doc.connectivity: 'edge' | 'corner' | 'corner-bridge'` (default `'edge'`). Serialized in the
project JSON with a tolerant loader (`edge` fallback for unknown values). Undo/redo comes for
free since it lives on the undoable document slice.

## Outline mode

The outline tracer builds a binary field over the padded node lattice and resolves each
marching-squares saddle by comparing the cell-center average with `iso` (currently `0.5`, strict
`>`). For a 2×2 block with two diagonal cells inside, the average is exactly `0.5`, so the saddle
currently resolves as disconnected.

- `corner` / `corner-bridge`: trace with `iso = 0.49` — the saddle resolves as connected and the
  silhouette flows through the shared corner as a pinch. The existing fillet pass rounds the two
  concave corners meeting at the pinch, so the zero-width waist opens into a smooth neck of
  width ≈ `2·r·(√2−1)`.
- `corner-bridge` additionally overlays, per junction, a centered rounded square path (side
  `0.6/sub` doc units, radius `0.5·side` → capsule-like joint) at the shared corner doc point
  `((x+1)/sub, (y+1)/sub)`. Overlays are separate subpaths of the same color path (evenodd-safe).
- Junction discovery for overlays: scan painted cells of the group; for cell `(x, y)` look at the
  diagonal `(x+1, y+1)` painted while `(x+1, y)` and `(x, y+1)` are empty — emit one junction
  (this orientation handles each junction exactly once).

## Metaball mode

With `corner`/`corner-bridge`, splat an extra kernel at each junction doc point using the same
Wyvill kernel and radius `R` as cells (junction discovery as above; kernel center
`((x+1)/sub, (y+1)/sub)` → field coords ×`sub·q`). Two diagonal cells then exceed the iso level
at the junction for any strength, merging their blobs. `edge` keeps current behavior.

## UI

Three-way segmented control (Только стороны / Через угол / Через угол + мост) placed above the
mode-specific controls; visible only when `renderMode !== 'pixels'`. i18n keys `connectivity.*`
in en/ru. Store action `setConnectivity`.

## Testing

Unit tests: outline two diagonal cells → one subpath under `corner`, two under `edge`;
`corner-bridge` adds an overlay subpath covering the junction point; metaball two diagonal cells
merge at low strength under `corner`; project round trip persists `connectivity`. Browser smoke:
visual check of pinch/neck/bridge in outline mode, junction merge in metaball.
