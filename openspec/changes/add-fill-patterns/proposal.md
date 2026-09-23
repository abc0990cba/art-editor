# Proposal: add-fill-patterns

## Why

The fill tool paints exactly one flat color, so every enclosed area is a uniform block. Classic pixel art relies on dithering — ordered Bayer patterns, checkerboards, noise — to fake rich gradients and texture with a limited palette, and vector-style artwork benefits from the same technique: a region filled with a dithered two-color mix reads as a gradient transition instead of a solid patch. Today none of that is possible; the only alternative is hand-stamping pixels.

## What Changes

- **Fill styles**: the fill tool gains a style switch — `solid` (current single-color behavior) and `pattern`. A pattern fill replaces the connected region with a per-cell mix of the active color and a configurable second color.
- **Pattern library**: Bayer 2×2 / 4×4 / 8×8 / 16×16 ordered dithering, positional noise dithering, interleaved gradient noise (IGN), block checkerboard, windowpane grid, cross-hatch, horizontal / vertical / diagonal stripes, zigzag rows, a dot grid, running-bond bricks, and concentric rings around the clicked cell. Stripes, hatching, dots and shapes scale their band/dot size with the mix ratio, so they double as texture fills.
- **Per-pattern settings**: a scale multiplier (tile size for stripes, dots, checker, grid, hatching, zigzag, bricks, rings) and a noise grain (block size for noise and IGN).
- **Transition profiles**: the mix ratio across the region is either flat (density slider) or a gradient — vertical, horizontal, diagonal, reverse diagonal (spanning the region's bounding box) or radial from the clicked cell. Combined with the pattern library this produces classic pixel-art dithered gradients (e.g. Bayer 8×8 + radial).
- **Per-tool settings**: double-clicking the fill tool opens a settings panel — style switch, pattern grid, transition chips, density slider, second color with a swap action, and a live pattern preview. Previously the fill tool had no options.
- **Region scopes**: symmetry copies each flood their own region; radial sector/ring fill scopes apply the pattern across the whole seed set as one region, so gradients span the wedge/ring.
- Pattern coordinates are buffer-space positions (sub-cell resolution on the square grid), so repeated fills land on the same pattern phase.
- **Canvas size presets**: the toolbar preset menu grows from five square sizes to grouped popular aspect ratios — 1:1, 4:3, 3:2, 16:9, 21:9, 2:1, 10:9 (Game Boy) and 8:7 (NES) — and every base size ships an odd sibling (+1×+1) whose central row/column hosts symmetry axes.

## Capabilities

### Modified

- `drawing-tools`: the flood fill requirement gains pattern/dither fill styles, the expanded pattern library, per-pattern settings and transition profiles; the per-tool options requirement gains the fill tool's settings panel.
- `canvas-grid`: the grid sizing requirement gains grouped aspect-ratio size presets with even and odd variants.

## Non-Goals

- Void-and-cluster / blue-noise dithering.
- Banded (posterized) gradients without dither and conic/angular gradients.
- Shade dithering relative to the target region's own color (lighten/darken fills).
- A fill-style preset library; live hover preview of the region before clicking.
