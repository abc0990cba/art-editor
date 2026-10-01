# Palettes & presets — technical notes

## Scope

The palette catalog and I/O (`palettes.ts`, `palettes-data.ts`, `palette-io.ts`) and the
editor-preset system (`presets.ts`, `preset-configs.ts`, `preset-lists*.ts`,
`preset-preview.ts`) — named snapshots of every changeable *configuration* (no painted
content). Plus the misc engine utilities that have no better home: `color.ts`, `sizes.ts`,
`stage-themes.ts`, `scrollbars.ts`.

## Module map

| File | Role |
|---|---|
| `src/engine/palettes-data.ts` | `CLASSIC_12` + `PALETTES` (35 entries) — "canonical published colors" |
| `src/engine/palettes.ts` | `PalettePreset`, `matchedPresetId` (exact length + order-insensitive-case match) |
| `src/engine/palette-io.ts` | DOM-free `parsePaletteText` (GPL or hex scan), `serializeHex` (Lospec), `serializeGpl` |
| `src/shared/lib/palette-files.util.ts` | DOM glue: `readPaletteFile` (image → `medianCut(·, 64)`), `palettePngBlob` (1-row swatch strip) |
| `src/engine/preset-configs.ts` | `PresetConfig { v: 1, … }`, `normalizePresetConfig`, `configMatchesState`, `BUILTIN_PRESETS` (62) |
| `src/engine/presets.ts` | `presetFromDoc` snapshot API |
| `src/engine/preset-lists*.ts` | 5 built-in groups: print (8), studio (23), textures (7), forms (20), retro (4) |
| `src/engine/preset-preview.ts` | procedural sample artwork → cached data-url thumbnails |
| `src/engine/color.ts` | RGB/HSV/CMYK conversions, `hexLuminance` (Rec.709), `toneScale` |
| `src/engine/sizes.ts` | size presets (ratio groups + odd siblings for symmetry axes) |
| `src/engine/stage-themes.ts` | 7 canvas stage themes (checker, grid line, guide, hover colors) |
| `src/engine/scrollbars.ts` | pure overlay-scrollbar metrics (`minThumbPx = 28`) |

## How it works

**Palettes.** 35 built-ins (Classic 12, PICO-8, Game Boy, C64, Sweetie 16, Endesga 32,
Vinik24, Resurrect 64, NYX8, Oil 6, Twilight 5, Ice Cream GB, Apollo, IBM CGA, B&W,
Game Boy Pocket, NES, ZX Spectrum, CGA Mode 4, Macintosh, Teletext, Gruvbox, Sepia, SLSO8,
Amber CRT, Green Phosphor, Harvest, Blueprint, Amiga Workbench, Windows 95, Nokia LCD,
DawnBringer 16, Vaporwave, Pastel Pop, Tokyo Night). Import parses
GIMP `.gpl` or any `#rrggbb` list (Lospec `.hex`); any bitmap imports as a palette via
median-cut (cap 64). Export: `.hex` (one color per line), `.gpl` (right-padded triplets), or
PNG (1-row swatch strip). `matchedPresetId` detects "this is built-in palette X" for UI
highlighting. (Palette *mixing* — inserting ramp midpoints — lives in the import pipeline,
[image-import](image-import.md), not here.)

**Presets.** A `PresetConfig` snapshots grid (type/size/sub/radialEven/rotation), palette,
pixel style, render mode, connectivity, metaball, texture, style scope, background, connector
width and symmetry state — `presetFromDoc` deep-copies the mutable parts. `normalizePresetConfig`
validates "defensively… clamped like the document deserializer". `configMatchesState`
(field-by-field, all 20 texture fields) marks which preset matches the current editor state.
62 built-ins assemble from 5 list files (forms presets generate from a `FormSpec` table).
Apply can resize/convert the doc (`convertedGridDoc`/`resizedDoc`/`subbedDoc`).
Thumbnails: `sampleCells(config)` renders a deterministic blob-flower sample through the real
geometry pipeline, cached by `id|updatedAt|maxSide`.

**Storage/state**: `PresetEntry` in the IDB `presets` store (normalized on access);
`presets.slice` actions: create/overwrite/rename/delete/duplicate/apply (+ `loadPresets`).
User preset import/export JSON lives in `import-presets.ts`.

## Misc utilities in brief

- `color.ts` — picker math: `hsvToRgb`/`rgbToHsv`, CMYK round trip, `normalizeHex`,
  `hexLuminance` (unparsable reads white), `toneScale(hex, min)` for tone-driven figure size.
- `sizes.ts` — every base size pairs with an odd sibling (+1 both axes): "odd grids have a
  central row/column, so symmetry axes can anchor on a real pixel line". Ratio groups:
  1:1, 4:3, 3:2, 16:9, 21:9, 2:1, Game Boy (10:9), NES (8:7).
- `stage-themes.ts` — 7 stage color themes (dark, paper, oled, nord, tokyo-night, vscode,
  catppuccin) independent of the app UI theme.
- `scrollbars.ts` — `scrollbarMetrics(contentDoc, viewStartDoc, viewportDoc, trackLenPx,
  minThumbPx = 28)` — pure model, DOM rendering in the stage.

## Invariants & constraints

- Palette colors are normalized lowercase `#rrggbb`; parse failure → `['#000000']` fallback
  (never empty).
- Preset configs are versioned (`v: 1`) and never contain painted content — applying a
  preset never destroys ink except via explicit resize/grid conversion.
- Built-in preset ids are namespaced `builtin.` (`isBuiltinPreset`).

## Performance characteristics

Preset thumbnails are rendered once per `(id, updatedAt)` and cached in a `Map`;
`renderThumbnailDataURL` cost is a full geometry build at ≤128 px side. Palette operations
are trivial. `persistence.bench.ts` covers serialize paths around presets.

## Testing

`palettes.test.ts` / `palette-io` coverage, `presets` normalization tests,
`import-presets.test.ts` (user preset JSON), `demo-project.test.ts` (adjacent registry).

## Related decisions

- [ADR-0006](../decisions/0006-indexeddb-persistence.md) — where user presets/brushes persist.
- In-flight `openspec/changes/add-editor-presets/` extends this system.

## OpenSpec capabilities

- `openspec/specs/pixel-styling/spec.md` (palette presets); `openspec/changes/add-editor-presets/`

## Known limitations

- Presets don't snapshot brush/tip state (separate brush library).
- `matchedPresetId` is exact-match; reordered/edited palettes lose their built-in badge.
