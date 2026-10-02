# Proposal: add-hybrid-dither-effects

## Why

Single-algorithm dithering plateaus: real print work mixes strategies per tone range,
poster art wants flat banded tones, duotone prints need a gradient map before
quantization, and engraved looks want ink lines over a dithered fill. The pipeline had
no way to combine any of these, and the ASCII dither was locked to one builtin ramp.

## What Changes

- **Hybrid bands** (`hybrid` dither): shadows, midtones and highlights each run their
  own registered algorithm (any of the 60+ ids, hybrid nesting rejected); split points
  are two luminance sliders. Each band runs the ordinary whole-image pipeline and the
  composite reads pixels by band — diffusion keeps its global scan inside each band.
- **Posterize + jitter** (`posterize` dither): tones collapse onto 2–32 bands with a
  Bayer-ordered jitter at the boundaries scaled by strength; strength 0 stays nearest.
- **Duotone gradient map**: optional two-ink projection of the sample's luminance
  before quantization — any dither then works over the duotone.
- **Edge outline**: post-dither overlay that inks detected luminance edges with the
  darkest palette color (the "lines over halftone" combo).
- **Custom ASCII ramps**: a dialog text field overrides the builtin character ramp for
  the `ascii` dither (validated to 2+ characters, else the builtin wins).
- **New import presets**: tri-band hybrid, duotone print, silk posterize.
- The preset validity test now derives valid dithers from the catalog instead of a
  hand-maintained list that had already drifted.

## Capabilities

### Modified

- `import-image`: the `hybrid` and `posterize` dithers, the new `ImportOptions`
  fields, and the effects section of the dialog.

## Non-Goals

- A user-editable diffusion-kernel weight grid (the custom-matrix bridge from the
  glyph editor covers user threshold patterns; kernels stay canonical tables).
- Stackable arbitrary effect pipelines (the pre/post chain stays fixed-order).
