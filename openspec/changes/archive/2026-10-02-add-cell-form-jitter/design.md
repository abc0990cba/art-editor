# Design: add-cell-form-jitter

## Model

`PixelStyle` gains three fields (defaults keep every existing document rendering identically):

```ts
/** Per-cell size spread 0..1: shrink each figure by deterministic value noise */
sizeJitter: number   // default 0
/** Per-cell angle spread in degrees 0..180: rotate each form by ±spread/2 of noise */
angleJitter: number  // default 0
/** Noise seed 1..9999; same seed = same field */
jitterSeed: number   // default 1
```

## Noise

`engine/jitter.ts` (new, ~30 lines): `jitterAt(style, i, cols)` → `{ size, angle }` per flat
cell index. Two smooth value-noise samples (bilinear over a coarse 8-cell lattice, seeded by
`hash2(ix, iy, seed)`, reuse `valueNoise`/`hash2` from `texture-core.ts`) — neighboring cells
correlate, so fields clump organically instead of flickering. The square path keys the noise
on sub-cell buffer coords (`i % bw`, floor division); the grid path on `i % cols` — one helper
takes the stride.

## Rendering

- Square path (`geometry-shape.ts` `pushCell`): when `sizeJitter > 0`, multiply `cw/ch` (and
  the radius) by `1 − sizeJitter·noise`; when `angleJitter > 0`, pass
  `rotation + (noise2 − 0.5)·angleJitter` into `cellShapeFragment`. `runMerge` gains the
  condition `sizeJitter === 0 && angleJitter === 0` (same gate line as texture/toneSize) so
  the RLE fast path is untouched unless jitter is used.
- Non-square path (`grid-geometry.ts` `gridPixels`): the same factors applied to `w/h` (after
  tone scaling) and the fragment rotation.
- Pixels mode only — outline/metaball ignore the fields (they have no per-cell figures).

## Identity & persistence

`samePixelStyle` (`doc-style.ts`), `elementStyleKey` (`geometry-elements.ts`),
`normalizeStyle` (`project-parse.ts`: clamp 0..1 / 0..180, seed 1..9999), preset
`normalizePresetConfig` + `stylesEqual` — mirror the existing `toneSizeMin` handling.

## UI

Style section, after the Size X/Y sliders: sliders «Size spread» / «Angle spread» (0–100% of
range, % display) and a seed row (readout + Randomize chip, same pattern as the texture
seed). i18n keys `style.sizeJitter`, `style.angleJitter`, `style.jitterSeed`,
`style.jitterSeed.randomize` (+ `.desc` each) in en + ru.

## Testing

- `jitter.test.ts` (new): deterministic for a fixed seed; `sizeJitter: 0` reproduces today's
  path strings byte-for-byte (golden); spread lowers average figure area monotonically;
  angle jitter leaves circle paths unchanged; run-merge disabled when jitter is on (rect
  runs stay separate); same seed across two docs of equal layout → equal paths.
- Round trip through project JSON; preset clamp of out-of-range values; element restyle
  invalidation on jitter change (`elements.test.ts` pattern).
- Browser smoke: scatter of circles with size spread reads organic; RLE perf unaffected with
  jitter off (existing `perf-stress` ratchets cover it).
