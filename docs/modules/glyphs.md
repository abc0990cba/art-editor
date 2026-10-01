# Glyphs — technical notes

## Scope

Glyph-tile dithering: user-editable tile ramps used as tone-mapped dither fields — by the
fill tool's `glyph` pattern, by the image-import glyph dithers, and by the glyph editor UI.
Files: `src/engine/glyph-tiles.ts`, `glyph-builtins.ts`, `glyph-generators.ts`,
`glyph-generators-art.ts`, `glyph-generators-forms.ts`, `glyph-preview.ts`; UI in
`src/features/glyph-editor/`; persistence in `src/storage/glyph-tiles.ts`; state in
`state/glyph.slice.ts`.

## Module map

| File | Role |
|---|---|
| `src/engine/glyph-tiles.ts` | `GlyphTileSet { name, w, h, levels }`, `glyphCellAt`, `glyphSetFromMatrix`, transforms |
| `src/engine/glyph-generators.ts` | 18 monotone generators (dots, lines, checker, rings, grain…) |
| `src/engine/glyph-generators-art.ts` | 12 character-first generators (halftone, bubbles, silk, argyle…) |
| `src/engine/glyph-generators-forms.ts` | cell-form ramps: `glyphSetForm`, Duo (interleaved lattices), Morph (radial-profile morph) |
| `src/engine/glyph-builtins.ts` | 74 built-in sets across 7 families |
| `src/engine/glyph-preview.ts` | DOM-free photo dither preview (`ditherImageWithGlyph`) |
| `src/features/glyph-editor/*` | right-panel section, level editor dialog, tile paint grid, gallery |
| `src/storage/glyph-tiles.ts` | `GlyphTileSetEntry` in the `glyphTiles` IDB store |

## How it works

Model (header): "A tile set is a ramp of boolean tiles: `levels[0]` is the empty (white) tile
and `levels[N-1]` is the full (black) tile; every level in between is a free-form,
user-editable pattern of w×h cells (row-major, like brush tips). Dithering picks a tile by
tone and reads the cell under the repeating tile grid."

- Clamps: tile size 1..16, levels 3..65 (default 9). `tileIndexForTone(t, n) = round(t·(n−1))`;
  `glyphCellAt` wraps tile coordinates.
- `glyphSetFromMatrix(m, name)` turns an n×n threshold matrix into n²+1 levels by rank
  threshold — Bayer 8×8 → 65 levels, exactly the max.
- Generators are pure `(tile size, levels) → GlyphTileSet`; the art generators "favour
  character over strictly linear coverage — every ramp still starts empty, ends solid and
  never loses ink as the tone rises" (generators `monotonize` by OR-ing each level into the
  next; hand-edited ramps are *not* forced monotone). Form generators draw via `cellShapeHit`
  — the same geometry as the canvas.
- **Editor UI**: compact right-panel section (ramp strip, resize chips 4/8/16) opening a
  dialog with a level navigator (add = duplicate current, min 2 levels), a press-drag paint
  grid ("the first cell you touch decides whether the stroke draws or erases"), generator
  chips (Bayer 2/4/8, Dots, Morph, Stars, Rings, Grain, lines, Checker, Invert, blank), save/
  overwrite/library, and a photo-preview gallery. `TILE_SIZES = [2,3,4,5,6,8,12,16]`.
- **State**: `glyph.slice` owns the library list, the draft (`glyphDraftId: null` = unsaved
  custom draft) and `applyGlyphSet` — which *also sets `doc.style.shape`* when the set has a
  form ("picking «Сердце» also makes the drawn pixel a heart").
- **Persistence**: `GlyphTileSetEntry` in the `glyphTiles` IDB store, normalized on every
  read/write, memory fallback.

**Consumers**: fill pattern `glyph` (`glyphCellAt` per cell — [dither-and-patterns](dither-and-patterns.md));
import dithers `glyph`/`palette-glyph` (tone glyphs replace the threshold matrix; palette
glyphs rank palette colors by luminance into levels — [image-import](image-import.md));
`ditherImageWithGlyph` renders the gallery's photo preview (Rec.709 per-cell luminance,
DOM-free `Raster`).

## Invariants & constraints

- `normalizeGlyphTileSet` only forces the empty/full end levels when `levels` was `undefined`
  — deliberately edited ramps may be non-monotone.
- Built-in sets are matched by object identity when picked without an id.
- The engine holds Russian user-facing strings for built-in set names (localization wraps
  around them).

## Performance characteristics

`glyphCellAt` is O(1) (index math); ramps are tiny (≤ 16×16×65 booleans). Photo preview
dithers at preview resolution only. No dedicated benches — the cost is dominated by callers.

## Testing

`glyph-tiles.test.ts`, `glyph-generators(-art/-forms).test.ts`, `glyph-preview.test.ts`,
`glyph-import.test.ts`, `glyph-fill.test.ts`.

## Related decisions

- [dither-and-patterns](dither-and-patterns.md) — the fill-pattern consumer.
- [image-import](image-import.md) — the import glyph dithers.

## OpenSpec capabilities

- No dedicated capability spec; surfaces via `drawing-tools` (fill pattern) and the import
  pipeline (`openspec/changes/expand-dither-toolkit/`).

## Known limitations

- Levels are boolean tiles — no multi-tone glyphs per level.
- No per-set tilt/angle (halftone generator bakes its 45° in).
