# Design: add-glyph-inlays

## Context

The inlay (shipped in add-cell-inlays) renders one registered cell form per cell through
`cellShapeFragment`. Emoji/letters need the system font stack, which the pure-vector pipeline
(path strings shared by canvas/PNG/SVG) cannot embed — so the character becomes a bitmap
stencil and the dots stay vector.

## Decisions

### Data model: five fields on `InlaySettings`

```ts
source: 'shape' | 'glyph'   // default 'shape'
glyph: string               // default '😀'; the first grapheme is used
resolution: number          // 4..12, default 8
dotShape: 'square' | 'circle' // default 'square'
dotScale: number            // 0.4..1, dot fill fraction of one matrix cell, default 0.85
```

`normalizeInlay` clamps/defaults the new fields; `sameInlay` compares them; old projects
(whose inlay objects lack the keys) parse to `'shape'` — rendering identical to before.

### Sampler: `engine/glyph/emoji-sample.ts`

`sampleGlyph(ch, resolution): Uint8Array` — an offscreen canvas of `resolution × 8` px per
side, `fillText` centered with a font stack `'Apple Color Emoji', 'Noto Color Emoji', sans-serif`
at `resolution*8` px, `getImageData` alpha ≥ 96 threshold, then block-averaged down to
resolution × resolution Uint8 (0/1). Bounded LRU (32 entries, keyed `ch@res`) because geometry
calls it per fragment build; deterministic per key. `typeof document === 'undefined'` returns a
centered dot fallback so vitest/node never touches the DOM. Browser-API-in-engine precedent:
`output/png.ts`.

### Rendering: dots replace the form fragment in glyph mode

`inlayFragment` branches on `source`: shape mode unchanged; glyph mode maps the bitmap onto the
inlay box (each on-bit → one dot fragment built by the same `roundedRectPath`/ellipse emitters
via `cellShapeFragment({ id: dotShape })` — one call per on-bit, capped at resolution² = 144
small fragments for a lone cell). The existing placement math (scale/offset/rotation per cell)
is applied by construction: the box is the same as for shapes. Consumers (shape.ts, gridPixels,
stagedInlayPath) call the same `inlayFragment` — no per-consumer changes.

Cost guard: resolution is capped at 12 (the settings slider max and the parser clamp both
enforce it).

### UI and plumbing

`InlayBody` gains a two-chip source row; glyph mode swaps the form grid + shape sliders for
char TextField + resolution slider + dot-shape chips + dot-scale slider (the common color
picker stays). i18n `style.inlay.source.*`, `glyph`, `resolution`, `dotShape.*`, `dotScale.*`
en+ru. `style.pixel` node gains `inlaySource`/`inlayGlyph`/`inlayResolution` (dot knobs stay
UI-level; the node writes them through `normalizeInlay` defaults). One built-in seed
"Emoji" (square cells + glyph inlay, circle dots). Tests: sampler determinism + fallback +
LRU shape (engine-safe), fragment composition (dots inside the box, per-cell), normalize
round-trip, fast-path preservation unchanged.

## Risks / Trade-offs

- Dot count: resolution² fragments per inked cell when enabled (≤144) — bounded by the cap and
  comparable to a halftone region; the off/default regime stays untouched.
- Emoji bitmaps differ across platforms (system font) — accepted: the stencil is a look, not a
  glyph-accurate typesetting system; SVG output stays font-free because dots are geometry.
- Color emoji rasterize with alpha, so the threshold treats them as silhouettes — flat inks
  only, documented in the proposal.
