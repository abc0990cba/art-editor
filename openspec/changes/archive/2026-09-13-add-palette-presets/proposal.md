# Proposal: add-palette-presets

## Why

The palette is currently an append-only list seeded with 12 fixed colors: there is no variety and
no way to work in a classic limited-palette style. Pixel artists expect curated classic palettes
(PICO-8, Game Boy, C64, Sweetie 16, Endesga 32…) that can be applied to the document at once.

## What Changes

- Add `src/engine/palettes.ts` with accurate classic palettes: PICO-8 (16), Game Boy DMG (4),
  Commodore 64 (16), Sweetie 16 (16), Endesga 32 (32), and the current default set as
  "Classic 12".
- Color panel: preset list with a mini swatch-strip preview per palette; clicking applies the
  palette to the document.
- Applying replaces the document palette; cell values are palette indices, so the artwork
  recolors by index (standard limited-palette workflow). Values wrap modulo the new palette
  length via the existing `cellColor` mapping. Custom colors picked later still append to the
  document palette.
- Applying is a document action (undoable) and round-trips through project save/load.

## Capabilities

### Modified

- `pixel-styling` — ADDED requirement: palette presets with apply-and-recolor semantics.

## Non-Goals

- Per-cell color remapping tools (gradient maps, hue shift)
- Palette editor UI (reorder, delete swatches)
- Importing `.hex` files
