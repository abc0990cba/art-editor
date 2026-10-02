# Tasks: add-text-dithering

## 1. Engine

- [x] 1.1 `bitmap-font.ts`: embedded 5×7 font, `glyphRows`, `fontCharset`
- [x] 1.2 `text-raster.ts`: density-ordered ramps, `charForTone`, `charDensity`,
      `textTiles`, `asciiGlyphSet`, `brailleGlyphSet`, memoized builtin dither sets
- [x] 1.3 `ascii-export.ts`: `buildAscii` over the synced doc buffer

## 2. Integration

- [x] 2.1 `ascii` + `braille` import dithers (glyph family, fixed sets, tone mapper)
- [x] 2.2 `source.text` node + `string` param kind (types, resolver, both editors)
- [x] 2.3 Export popover: ASCII .txt action
- [x] 2.4 i18n (EN/RU): two dithers + export action

## 3. Tests

- [x] 3.1 `text-raster.test.ts`: font invariants, tile layout, ramp/density order,
      glyph-set bridges, ASCII export, source.text stamping/clip/determinism
- [x] 3.2 New dither ids covered by the catalog conformance loop (determinism,
      palette bounds, strength-0 ≡ nearest)
- [x] 3.3 Full gate green
