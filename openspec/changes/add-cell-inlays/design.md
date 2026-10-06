# Design: add-cell-inlays

## Context

`shapeGeometry` (geometry/shape.ts) groups fragments per palette value
(`groups: Map<number, string[]>`) and emits one `StyledPath` per group; canvas/SVG paint paths
in array order with evenodd fill. Per-cell transformations (tone sizing, spread) are applied
inside `pushCell`. Non-square grids have a parallel per-cell path (`gridPixels`), and in-stroke
preview mirrors cells through `stagedCellPath`. Style equality lives in `samePixelStyle`
(doc-style.ts) and the element style key (geometry/elements.ts).

## Decisions

### Data model: `InlaySettings` on `PixelStyle`

```ts
interface InlaySettings {
  shape: CellShapeId | 'none'
  scale: number      // 0.1..0.9 of the base figure box
  offsetX: number    // -0.5..0.5 of the box
  offsetY: number
  rotation: number   // deg 0..360, own (added on top of per-cell angle spread)
  thickness: number  // 0.05..0.5, ShapeParams.thickness semantics
  points: number     // 3..12
  colorMode: 'slot' | 'darken' | 'lighten' | 'toneDark' | 'toneLight'
  slot: number       // palette value (>=1) for the slot mode
  depth: number      // 0..1 darken/lighten strength
}
```

Placed on `PixelStyle` so `ElementStyle.style` freezes and `PresetConfig.style` snapshots pick
it up without schema changes. If `doc.ts` is ratchet-locked, the interface lives in a new
`engine/core/inlay.ts` and doc.ts re-exports the type (import lines only). Default:
`{ shape: 'none', scale: 0.45, offsetX: 0, offsetY: 0, rotation: 0, thickness: 0.25,
points: 5, colorMode: 'darken', slot: 1, depth: 0.35 }`.

### Color derivation: `engine/color/shade.ts`

`shadeHex(hex, depth)` mixes toward black, `tintHex(hex, depth)` toward white (RGB mix on the
existing hex/rgb utils). `inlayColorOf(doc, v)` resolves the mode: slot → `cellColor(doc,
slot)`; darken/lighten → shade/tint of `cellColor(doc, v)`; toneDark/toneLight → the min/max
luminance palette entry (computed once per geometry build via `hexLuminance`).

### Rendering: separate group map, emitted after base groups

`shapeGeometry` gains a second map `inlayGroups: Map<number, string[]>` keyed by the same
palette value. Inside `pushCell`, after the base fragment, an inlay fragment is appended when
`inlay.shape !== 'none'`. At emission, base paths are pushed first, then inlay paths — array
order makes them paint on top under evenodd. Keying by source value (not by resolved color)
keeps grouping aligned with the palette and lets constant-color modes resolve per key without a
dedupe pass (a handful of extra `<path>` elements at worst).

The emitter itself lives in a new `engine/geometry/inlay.ts`
(`pushInlayFragment(groups, style, inlay, box, v)`) so `shape.ts` (near its line cap) only
gains the call and the gate lines. The inlay box derives from the final base figure box
`{x, y, w, h}` (post tone/stretch/spread): `iw = w·scale`, center = base center + offset·box,
then `cellShapeFragment` with the inlay's own params plus the document radius and chamfer
settings. The per-cell angle delta from spread rotates the inlay the same way it rotates the
base (via the fragment's rotation parameter).

### Gates

- `runMerge` additionally requires `doc.style.inlay.shape === 'none'` — inlay forces the
  per-cell loop, exactly like rounding.
- `textured` unchanged: baked texture holes keep punching the base figure only; the inlay
  paints over them (accepted, documented).
- `tileEligible` unchanged: inlay is deterministic per cell, dirty tiles stay valid.
- `stagedCellPath` gains the same inlay fragment so the live stroke preview matches the
  committed geometry; `gridPixels` derives the inlay from its per-cell figure bbox.

### Pixels mode only

Outline/metaball/contour/extrude ignore the block; the UI group is hidden outside pixels mode
(same pattern as the metaball knobs). Restyling in those modes keeps the block untouched.

### Style equality and grouping

`samePixelStyle` extends its field-by-field comparison with the inlay block (object equality
helper in the same module); `elementStyleKey` mixes the inlay fields into the key so two
elements with different inlays never share a geometry style group.

### Serialization, presets, nodes

`project-json.ts` writes `style.inlay` when non-default; `project-parse.ts` clamps every field
(missing object → default). `normalizePresetConfig` clamps the same fields. The `style.pixel`
node gains optional inlay params written into `ElementStyle.style.inlay`.

### Built-in presets

Two `PresetSeed` rows in `presets/lists-forms.ts`: "Dotted" (circle + darken inlay dot) and
"Halftone core" (square + ring inlay). Thumbnails are procedural already.

## Risks / Trade-offs

- Inlay doubles fragment count for inked cells when enabled — bounded by the same per-cell
  path as rounded cells; the fast path keeps plain documents untouched.
- Fragment groups keyed by value duplicate constant-color inlays across palette entries
  (negligible path-count overhead, no geometry duplication).
- `pushCell` grows by one call + gate expressions — shape.ts stays within its ratchet because
  the emitter body lives in `geometry/inlay.ts`.
