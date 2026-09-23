# Design: add-palette-presets

## Data (`src/engine/palettes.ts`)

```ts
export interface PalettePreset { id: string; name: string; colors: string[] }
export const PALETTES: PalettePreset[]
```

Accurate hex values; `classic12` mirrors the default document palette (moved here so
`defaultDoc()` and the UI share one source — `defaultDoc()` imports the preset colors).

## Apply semantics

Store action `applyPalette(preset)`: `doc.palette = [...preset.colors]` (new array → new doc
reference → undoable via the existing temporal slice; autosave picks it up). Rendering already
maps a cell value `v` to `palette[(v - 1) % palette.length]`, so artwork recolors by index and
long palettes degrade gracefully when a shorter preset is applied.

## UI

Color section gains a "Palettes" group above the quick swatches: one row per preset —
name + a strip preview (each preset color as a thin flex slice, `flex:1`, height 10px, rounded).
The applied preset is highlighted when its colors equal the document palette prefix (comparison
based, so appending custom colors simply clears the highlight — no extra state). i18n:
`palette.presets` (EN "Palettes" / RU «Палитры»); preset names are proper nouns, not translated.

## Testing

Unit tests in `src/engine/palettes.test.ts`: every preset has 4–64 unique valid hex colors and
is sorted-free; applying maps cells by index (build a doc with values 1–3, apply Game Boy, expect
rendered colors wrap modulo 4); round trip through serialize/deserialize preserves the applied
palette. Browser smoke: apply PICO-8 → artwork recolors; undo restores.
