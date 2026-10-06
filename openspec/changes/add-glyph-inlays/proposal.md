# Proposal: add-glyph-inlays

## Why

The inner-figure inlay draws registered vector forms only. Artists asking for "a vector emoji
inside each pixel" — emoji mosaics, letter-spaced headlines made of cells, kaomoji grids —
need arbitrary characters (emoji, letters, symbols) as the inlay content. Native text rendering
would break the pure-vector pipeline (SVG export needs embedded fonts), so the inlay samples
the character into a small dot-matrix instead — pixels within pixels, faithful to the editor's
aesthetic and identical across canvas, PNG and SVG.

## What Changes

- `InlaySettings` gains `source` (`'shape' | 'glyph'`), `glyph` (the character), `resolution`
  (4–12, dot-matrix side), `dotShape` (`square | circle`) and `dotScale` (dot fill fraction).
- New `engine/glyph/emoji-sample.ts`: the character is rasterized through an offscreen canvas
  (`fillText` with the system emoji/font stack), alpha-thresholded into a resolution ×
  resolution ink bitmap, memoized in a bounded LRU. Node environments get a deterministic
  fallback so geometry stays testable.
- Rendering: in glyph mode the inlay emits one dot per on-bit inside the inlay box (existing
  scale/offset/rotation/color controls apply unchanged); works in the square-grid path, the
  non-square-grid path and the staged preview.
- UI: a source toggle in the inner-figure group; glyph mode exposes the character field,
  resolution slider, dot shape chips and dot scale. i18n en+ru; `style.pixel` node gains the
  glyph params; an "Emoji" built-in preset demonstrates the look.

## Capabilities

### Modified

- `pixel-styling` — MODIFIED requirement: inner figure inlays extended with the glyph source
  (dot-matrix characters inside every cell).

## Non-Goals

- Native `fillText`/`<text>` rendering in exports (stays pure vector).
- Multi-character text per cell (one grapheme per inlay; headlines = one cell per letter).
- Color emoji glyph colors (dots are flat inks in the inlay color; emoji act as stencils).
