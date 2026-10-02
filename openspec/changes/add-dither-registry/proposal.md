# Proposal: add-dither-registry

## Why

Adding one import dither currently touches five disconnected places: the `ImportDither`
union, the `ORDERED_DITHERS` set, a dispatch table (`ORDERED_FIELDS` /
`DIFFUSION_KERNELS`), a hardcoded if-chain in `ditherSample`, and a hand-written
`DITHER_GROUPS` list in the import feature. Scaling the library to ~60 more effects on
that pattern multiplies the cost and lets the UI lists silently drift from the pipeline.

## What Changes

- **Declarative catalog** `src/engine/dither-catalog.ts`: every import dither id
  declared exactly once with its strategy family (off / ordered / diffusion / special /
  glyph) and the UI switches it enables (threshold bias slider).
- **Derived consumers**: the pipeline dispatch (`ditherSample`), the ordered-threshold
  slider visibility, the dialog's grouped select and the visual gallery all read the
  catalog; the special and glyph strategy if-chains become explicit per-family dispatch
  registries (`SPECIAL_MAPPERS`, `GLYPH_MAPPERS`).
- **No behavior change**: existing 24 dithers keep pixel-identical output (pinned by
  the existing determinism / strength-0 / palette-bound tests).

## Capabilities

### Modified

- `import-image`: the dither algorithm library is registry-driven — the dialog UI and
  the pipeline both derive from one catalog.

## Non-Goals

- New algorithms or UI (covered by `expand-dither-algorithms` and later changes).
- Fill patterns, textures and node-graph effects (their own catalog phases).
