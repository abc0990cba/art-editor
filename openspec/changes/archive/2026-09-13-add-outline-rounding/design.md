# Design: add-outline-rounding

## Render mode

`Doc.renderMode: 'pixels' | 'outline' | 'metaball'` replaces `MetaballSettings.enabled` (which is
removed from the type). `MetaballSettings` keeps strength/perColor/quality. `buildGeometry`
switches on the mode: pixels → existing shape geometry, metaball → existing field geometry,
outline → new outline geometry. Project JSON stays `v: 1`; the loader reads `renderMode` when
present and falls back to `metaball.enabled` (true → `'metaball'`, false/absent → `'pixels'`).

## Outline algorithm (`engine/outline.ts`)

1. Group cells by value (always color-isolated — outlines of different colors never merge).
2. Per group, build a binary field with a zero padding ring: node `(x+1, y+1)` = 1 when buffer
   cell `(x, y)` belongs to the group. The padding ring makes the contour follow the canvas edge
   for cells touching it and guarantees closed loops.
3. Reuse `marchingSquares(field, fw, fh, 0.5)`: with binary values the interpolated crossings
   land exactly on integer cell-boundary lines, giving the axis-aligned staircase of the union.
4. Convert to doc units: `x = (fx - 1) / sub`.
5. Merge collinear runs: drop every vertex whose incoming and outgoing directions are equal.
6. Fillet every remaining vertex (a 90° turn): tangent length
   `t = min(r, prevLen / 2, nextLen / 2)` with `r = style.radius × (1 / sub)`, emit a circular
   arc `A t t 0 0 sweep` from `vertex − dirIn·t` to `vertex + dirOut·t`; sweep flag comes from
   the sign of the cross product (handles both loop orientations and concave corners).
7. Emit one compound path per color group with `fill-rule="evenodd"`; holes survive as inner
   loops. Connectors render as round-capped strokes exactly as in pixels mode.

Complexity is O(buffer size) per group; no quality knob needed (the field is binary, not sampled).

## UI

The pixel style section gains a three-way segmented control (Пиксели / Контур / Metaball). The
corner-radius slider is shared by pixels and outline modes; per-corner and stretch render only in
pixels mode; strength/isolation/quality only in metaball mode. `setRenderMode` is a document
action (undoable). i18n keys `mode.*` in en/ru.

## Testing

Unit tests: two-cell seam (one compound path, no notch vertex), L-shape arc count (6), isolated
cell at 50% radius (4 arcs), sub-cell adjacency at ×2, old-project migration, metaball tests
migrated to `renderMode`. Browser smoke: switch all three modes, seam and L-shape visuals,
sub-cells, export parity.
