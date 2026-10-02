# Proposal: add-text-dithering

## Why

The user's core request — "dither from any symbols and texts" — had no plumbing at all:
no font rasterizer, no character ramps, no text node, no text-art export. The glyph
tile-set system (boolean ramps) was the perfect host format, but nothing could produce
character tiles.

## What Changes

- **`src/engine/bitmap-font.ts`** — an embedded pure 5×7 bitmap font (A–Z, 0–9,
  punctuation; ~45 glyphs, DOM-free), the single glyph source for everything below.
- **`src/engine/text-raster.ts`** — the text machinery: density-ordered ASCII ramps
  (classic / blocks / minimal), tone→character mapping, text rasterization to boolean
  grids, `asciiGlyphSet` (ramp → GlyphTileSet), `brailleGlyphSet` (all 256 8-dot
  patterns as a 2×4 tile ramp, 257 levels) and the fixed tile sets behind the new
  dithers.
- **Two import dithers in the glyph family**: `ascii` (tone picks the letter from the
  classic ramp) and `braille` (8-dot braille cells — 2×4 sub-dot resolution per pixel).
- **`source.text` node** — the node graph's first text source: renders the bitmap font
  into ink cells with offset/scale/tracking/ink params. Enabled by a new `string`
  param kind threaded through the param schema, resolver and both node editors.
- **ASCII text export** — the export popover gains "Export ASCII (.txt)":
  `buildAscii` renders one character per cell, tone from palette luminance, optional
  inversion for dark backgrounds.

## Capabilities

### Modified

- `import-image`: `ascii` and `braille` join the glyph family (fixed builtin sets, no
  picker required).
- Node graph: `source.text`, the string param kind.
- Export: ASCII text output alongside SVG/PNG/JSON.

## Non-Goals

- System-font rasterization (Canvas/DOM) — the embedded font keeps the engine pure;
  a DOM-side font picker can feed user glyph sets through the existing editor.
- Emoji/pictogram tiles; color font rendering.
