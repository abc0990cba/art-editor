# Design: fix-bridge-junction

## Diamond overlay

`bridgeOverlays` (outline.ts) currently emits `roundedSquare(J, 0.6/sub, 0.27)` — nearly a circle
centered on the junction J, sticking out perpendicular to the cell diagonal. Replace with a
diamond: vertices at the midpoints of the four cell edges incident to J —

- `(Jx ± 0.5/sub, Jy)` and `(Jx, Jy ± 0.5/sub)`

— filleted via the shared `emitFilletPath` with radius `doc.style.concaveRadius / doc.sub`
(clamped to a quarter edge by the emitter's tangent clamping), honoring the chamfer style. The
diamond's vertices touch the cells' edge midpoints, so the joint spans exactly the junction
neighborhood: no bulge beyond the cell envelope, symmetric under 90° rotation and reflection, and
identical for every diagonal direction.

Emission: `emitFilletPath([[V1, V2, V3, V4]], r, r, chamfer)` (a convex loop → all corners use the
convex radius). `roundedSquare` is removed.

## UI gating

Per-corner block in SettingsPanel renders only when `doc.gridType === 'square'` and
`doc.renderMode === 'pixels'`.

## Testing

Update the corner-bridge unit test to the diamond path; add a test asserting two diagonal pairs
along different diagonals produce identical (translation/reflection-equivalent) overlays; browser
smoke of a diagonal pair and an L-shape in Corner + Bridge.
