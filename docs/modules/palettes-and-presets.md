# Palettes & presets — technical notes

## Scope

The palette catalog and I/O in [`src/engine/color/`](../../src/engine/color/index.ts) and the
editor-preset system in [`src/engine/presets/`](../../src/engine/presets/index.ts) — named snapshots
of every changeable *configuration* (no painted content). Plus the misc engine utilities that have no
better home: the `core/` helpers [`sizes.ts`](../../src/engine/core/sizes.ts),
[`stage-themes.ts`](../../src/engine/core/stage-themes.ts), [`scrollbars.ts`](../../src/engine/core/scrollbars.ts).

## Module map

| File | Role |
|---|---|
| [`src/engine/color/palettes-data.ts`](../../src/engine/color/palettes-data.ts) | `PalettePreset`, `CLASSIC_12` + `PALETTES` (35 entries) — "canonical published colors" |
| [`src/engine/color/index.ts`](../../src/engine/color/index.ts) | palettes preset barrel (renamed from the `palettes.ts` shim): re-exports `CLASSIC_12`/`PALETTES`, `matchedPresetId` (exact length + order-insensitive-case match) |
| [`src/engine/color/color.ts`](../../src/engine/color/color.ts) | RGB/HSV/CMYK conversions, `normalizeHex`, `hexLuminance` (Rec. 709), `toneScale`, `paletteLuma` (BT.601) |
| [`src/engine/color/palette-io.ts`](../../src/engine/color/palette-io.ts) | DOM-free `parsePaletteText` (GIMP header or hex scan), `parseGpl`, `serializeHex` (Lospec), `serializeGpl` |
| [`src/shared/lib/palette-files.util.ts`](../../src/shared/lib/palette-files.util.ts) | DOM glue: `readPaletteFile` (image → `medianCut(·, 64)`), `palettePngBlob` (1-row swatch strip) |
| [`src/engine/presets/configs.ts`](../../src/engine/presets/configs.ts) | data shapes: `PresetConfig { v: 1, … }`, `EditorPreset`, `PresetSeed`/`PresetInput`, `SWEETIE_16` |
| [`src/engine/presets/index.ts`](../../src/engine/presets/index.ts) | facade: `presetFromDoc` snapshot API, `normalizePresetConfig`, `configMatchesState`, `BUILTIN_PRESETS` (62), `isBuiltinPreset` |
| [`src/engine/presets/lists.ts`](../../src/engine/presets/lists.ts) | print seeds (8): halftone screen effects on paper-like palettes |
| [`src/engine/presets/lists-studio.ts`](../../src/engine/presets/lists-studio.ts) | studio seeds (23): decorative starters across grids/modes/symmetry |
| [`src/engine/presets/lists-textures.ts`](../../src/engine/presets/lists-textures.ts) | texture seeds (7): grain/grunge/pattern studies |
| [`src/engine/presets/lists-forms.ts`](../../src/engine/presets/lists-forms.ts) | form seeds (20): generated from a `FormSpec` table (one cell shape each) |
| [`src/engine/presets/lists-retro.ts`](../../src/engine/presets/lists-retro.ts) | retro seeds (4): vintage machines/terminals |
| [`src/engine/presets/preview.ts`](../../src/engine/presets/preview.ts) | procedural sample artwork (`sampleCells`) → cached data-url thumbnails via `renderThumbnailDataURL` |
| [`src/engine/core/sizes.ts`](../../src/engine/core/sizes.ts) | size presets (ratio groups + odd siblings for symmetry axes) |
| [`src/engine/core/stage-themes.ts`](../../src/engine/core/stage-themes.ts) | 7 canvas stage themes (checker, grid line, guide, hover colors) |
| [`src/engine/core/scrollbars.ts`](../../src/engine/core/scrollbars.ts) | pure overlay-scrollbar metrics (`minThumbPx = 28`) |

Tests: [`color.test.ts`](../../src/engine/color/color.test.ts),
[`palettes.test.ts`](../../src/engine/color/palettes.test.ts),
[`palette-io.test.ts`](../../src/engine/color/palette-io.test.ts),
[`presets.test.ts`](../../src/engine/presets/presets.test.ts).

## How it works

**Palettes.** 35 built-ins in [`palettes-data.ts`](../../src/engine/color/palettes-data.ts) (Classic
12, PICO-8, Game Boy, C64, Sweetie 16, Endesga 32, Vinik24, Resurrect 64, NYX8, Oil 6, Twilight 5,
Ice Cream GB, Apollo, CGA 16, B&W, Game Boy Pocket, NES, ZX Spectrum, CGA Mode 4, Macintosh,
Teletext, Gruvbox, Sepia, SLSO8, Amber CRT, Green Phosphor, Harvest, Blueprint, Amiga Workbench,
Windows 95, Nokia LCD, DawnBringer 16, Vaporwave, Pastel Pop, Tokyo Night). Import
([`palette-io.ts`](../../src/engine/color/palette-io.ts)): a `GIMP` header routes to `parseGpl`
("R G B Name" lines, deduped), anything else is scanned for 6-digit hex codes (Lospec `.hex` is just
such a list); results run through `normalizePalette` from
[`src/engine/import/`](../../src/engine/import/index.ts) — parse failure returns `null`, never an
empty palette. Any bitmap imports as a palette via median-cut (cap 64) in the shared DOM glue
(`palette-files.util.ts`). Export: `.hex` (one lowercase color per line), `.gpl` (right-padded
triplets + uppercase-hex names), or PNG (1-row swatch strip). `matchedPresetId` in
[`index.ts`](../../src/engine/color/index.ts) detects "this is built-in palette X" for UI
highlighting. (Palette *mixing* — inserting ramp midpoints — lives in the import pipeline,
[image-import](image-import.md), not here.)

**Presets.** A `PresetConfig` ([`configs.ts`](../../src/engine/presets/configs.ts)) snapshots grid
(type/size/sub/radialEven/rotation), palette, pixel style, render mode, connectivity, metaball,
texture, style scope, background, connector width and symmetry state — `presetFromDoc(doc, symmetry)`
in [`index.ts`](../../src/engine/presets/index.ts) deep-copies the mutable parts.
`normalizePresetConfig` validates "defensively… clamped like the document deserializer" (including a
legacy `texture.size` → `sizeMin`/`sizeMax` migration). `configMatchesState` compares field-by-field
(all 22 texture fields via the `TEXTURE_FIELDS` list) and marks which preset matches the current
editor state. The 62 `BUILTIN_PRESETS` assemble from the five seed lists; each `PresetSeed` is merged
over the default config by `builtin()` and validated, so definitions stay terse (form presets
generate from a `FormSpec` table in [`lists-forms.ts`](../../src/engine/presets/lists-forms.ts)).
Apply can resize/convert the doc (`convertedGridDoc`/`resizedDoc`/`subbedDoc` in
[`src/engine/core/scene.ts`](../../src/engine/core/scene.ts), invoked by the slice).

**Storage/state**: user presets are `PresetEntry` rows in the IDB `presets` store
([`src/storage/presets.ts`](../../src/storage/presets.ts), normalized on access); the
[`presets.slice`](../../src/state/presets.slice.ts) actions are
create/overwrite/rename/delete/duplicate/apply (+ `loadPresets`). Built-ins never touch IDB.

**Thumbnails**: [`preview.ts`](../../src/engine/presets/preview.ts) `sampleCells(config)` paints a
deterministic blob-flower over the whole buffer (colors cycling the palette, fold count from
`symmetry.n`), rendered through the real geometry pipeline by `renderThumbnailDataURL`
([`src/engine/output/png.ts`](../../src/engine/output/png.ts)) and cached by `id|updatedAt|maxSide`.

## Misc utilities in brief

- [`color.ts`](../../src/engine/color/color.ts) — picker math: `hsvToRgb`/`rgbToHsv`, CMYK round
  trip, `normalizeHex`, `hexLuminance` (unparsable reads white), `toneScale(hex, min)` for
  tone-driven figure size, `paletteLuma` for render-mode contrast decisions.
- [`sizes.ts`](../../src/engine/core/sizes.ts) — every base size pairs with an odd sibling (+1 both
  axes): "odd grids have a central row/column, so symmetry axes can anchor on a real pixel line".
  Ratio groups: 1:1, 4:3, 3:2, 16:9, 21:9, 2:1, Game Boy (10:9), NES (8:7).
- [`stage-themes.ts`](../../src/engine/core/stage-themes.ts) — 7 stage color themes (dark, paper,
  oled, nord, tokyo-night, vscode, catppuccin) independent of the app UI theme.
- [`scrollbars.ts`](../../src/engine/core/scrollbars.ts) — `scrollbarMetrics(contentDoc,
  viewStartDoc, viewportDoc, trackLenPx, minThumbPx = 28)` — pure model, DOM rendering in the stage.

## Invariants & constraints

- Palette colors are normalized lowercase `#rrggbb`; `parsePaletteText` returns `null` on failure and
  callers fall back (never an empty palette).
- Preset configs are versioned (`v: 1`) and never contain painted content — applying a preset never
  destroys ink except via explicit resize/grid conversion.
- Built-in preset ids are namespaced `builtin.` (`isBuiltinPreset`).
- `matchedPresetId` is exact-match (length + per-index case-insensitive hex).

## Performance characteristics

Preset thumbnails are rendered once per `(id, updatedAt)` and cached in a `Map`;
`renderThumbnailDataURL` cost is a full geometry build at ≤128 px side. Palette operations are
trivial. [`src/engine/core/persistence.bench.ts`](../../src/engine/core/persistence.bench.ts) covers
serialize paths around presets.

## Testing

- [`palettes.test.ts`](../../src/engine/color/palettes.test.ts) — palette preset data integrity.
- [`palette-io.test.ts`](../../src/engine/color/palette-io.test.ts) — `parsePaletteText`, `parseGpl`,
  serialization round trips.
- [`color.test.ts`](../../src/engine/color/color.test.ts) — conversion math.
- [`presets.test.ts`](../../src/engine/presets/presets.test.ts) — built-in assembly, `normalizePresetConfig`
  clamping/migration, `presetFromDoc` / `configMatchesState` parity.
- Adjacent: [`storage/demo-seed.test.ts`](../../src/storage/demo-seed.test.ts) (demo projects seeded
  from [`engine/demos/`](../../src/engine/demos/index.ts)), `storage/presets.test.ts` (IDB store).

## Related decisions

- [ADR-0006](../decisions/0006-indexeddb-persistence.md) — where user presets/brushes persist.

## OpenSpec capabilities

- `openspec/specs/pixel-styling/spec.md` (palette presets); in-flight `openspec/changes/add-editor-presets/`

## Known limitations

- Presets don't snapshot brush/tip state (separate brush library).
- `matchedPresetId` is exact-match; reordered/edited palettes lose their built-in badge.
- No user-preset JSON import/export yet — user presets live only in IndexedDB.
