# Gradient workspace — technical notes

## Scope

Raster→vector *gradient* fitting: `src/engine/gradient/` plus the gradient workspace feature
(`src/features/gradient/`). Third project kind: the output is an AI-safe SVG of native
`linearGradient`/`radialGradient` paints — "the subset that browsers draw natively and Adobe
Illustrator imports reliably" ([`src/engine/gradient/types.ts`](../../src/engine/gradient/types.ts)
header). Shares color clustering and outline tracing with the
[vectorizer](vectorizer.md); the decoded-raster input type `ImportBitmap` comes from the
import domain.

## Module map

| File | Role |
|---|---|
| [`src/engine/gradient/pipeline.ts`](../../src/engine/gradient/pipeline.ts) | `traceGradientImage` facade + `errorMap` ΔE heatmap |
| [`src/engine/gradient/types.ts`](../../src/engine/gradient/types.ts) | `RegionPixels`, `GradFit` paint models, `FitOptions` |
| [`src/engine/gradient/params.ts`](../../src/engine/gradient/params.ts) | `GradientParams`, `normalizeGradientParams`, `GRADIENT_PRESETS` (7) |
| [`src/engine/gradient/segment.ts`](../../src/engine/gradient/segment.ts) | region extraction from quantizer labels, `regionPixels`, `maskPath` |
| [`src/engine/gradient/fit-linear.ts`](../../src/engine/gradient/fit-linear.ts) | weighted affine regression → Jacobian → principal eigenvector = gradient direction |
| [`src/engine/gradient/fit-radial.ts`](../../src/engine/gradient/fit-radial.ts) | weighted least-squares intersection of iso-color normals + Huber IRLS |
| [`src/engine/gradient/profile.ts`](../../src/engine/gradient/profile.ts) | binned weighted medians → perceptual RDP → candidate stop offsets |
| [`src/engine/gradient/stop-colors.ts`](../../src/engine/gradient/stop-colors.ts) | Thomas-algorithm tridiagonal solve for exact stop colors + coordinate-descent refinement |
| [`src/engine/gradient/layers.ts`](../../src/engine/gradient/layers.ts) | 'stacked' mode: `fitRegionLayers` residual spots as AI-safe Gaussian-splat equivalents |
| [`src/engine/gradient/model-select.ts`](../../src/engine/gradient/model-select.ts) | `fitRegion`: solid → linear → radial by ΔE tolerance; quadratic smoothness gate |
| [`src/engine/gradient/linalg.ts`](../../src/engine/gradient/linalg.ts) | hand-rolled Gaussian elimination, 2×2 eigen, Thomas — engine stays dependency-free |
| [`src/engine/gradient/color.ts`](../../src/engine/gradient/color.ts) | sRGB↔Lab (D65), ΔE2000 |
| [`src/engine/gradient/render.ts`](../../src/engine/gradient/render.ts) | `evalFitColor` — mathematical renderer matching browser stop interpolation |
| [`src/engine/gradient/compose.ts`](../../src/engine/gradient/compose.ts) | AI-safe SVG serialization (`userSpaceOnUse`, hex stops, no blend modes), `fitFill`, `spotDef` |
| [`src/engine/gradient/synth.util.ts`](../../src/engine/gradient/synth.util.ts) | seeded synthetic fields for tests (mulberry32 noise, quantization banding) |
| [`src/features/gradient/gradient.worker.ts`](../../src/features/gradient/gradient.worker.ts) | same worker protocol as the trace worker + demap transfer |

## How it works

`traceGradientImage(bitmap, params)` ([`src/engine/gradient/pipeline.ts`](../../src/engine/gradient/pipeline.ts)),
in call order:

1. `normalizeGradientParams` clamps every field (old storage rows and preset fragments become
   valid parameter sets).
2. `clusterImage` from the trace engine ([`src/engine/trace/quantize.ts`](../../src/engine/trace/quantize.ts))
   with trace defaults and `layerDifference: 0` — segmentation only, no color folding.
3. Per region: `maskPath` (trace-engine outline via
   [`src/engine/trace/binary-layer.ts`](../../src/engine/trace/binary-layer.ts) +
   [`src/engine/trace/simplify.ts`](../../src/engine/trace/simplify.ts), wired in
   [segment.ts](../../src/engine/gradient/segment.ts)) + `regionPixels`; regions below
   `minRegion` stay flat ("so the image stays opaque").
4. `fitRegion` ([model-select.ts](../../src/engine/gradient/model-select.ts)) fits solid →
   linear → radial, keeping the simplest model whose mean ΔE2000 stays within tolerance; a
   quadratic color-surface regression gates on smoothness ("on non-smooth fields gradient
   models are meaningless").
5. `'stacked'` mode: `fitRegionLayers` ([layers.ts](../../src/engine/gradient/layers.ts)) adds
   residual spot layers over the base fit.
6. Serialization: base fill `url(#gN)` + one same-`d` path per spot layer `url(#sN)`,
   painter-stacked through `fitFill`/`spotDef` ([compose.ts](../../src/engine/gradient/compose.ts)),
   assembled by `composeSvg` ([`src/engine/trace/compose.ts`](../../src/engine/trace/compose.ts)).
7. Also emits a downsampled ΔE heatmap (`errorMap`: ΔE2000 × 8, stride 4) for the preview's
   divergence view.

**Linear fit**: weighted affine regression of each channel over (x, y) gives a color
Jacobian; the principal eigenvector of JᵀJ is the gradient direction (λ2/λ1 says how 1-D the
field is); samples project onto that axis; axis oriented toward increasing color; geometry
anchored so stop offsets and SVG coordinates share one system.

**Radial fit**: iso-color lines of a radial gradient are circles, so image gradients point
at/away from the center; the weighted least-squares intersection of those lines (normals ⊥
gradient, Huber-reweighted, 3 IRLS iterations) yields the center; parallel (linear) fields
are detected and rejected. Sobel on box-blurred luminance supplies gradients.

**Stops**: positions from [profile.ts](../../src/engine/gradient/profile.ts) (tolerance
doubles until ≤ maxStops); colors solved exactly for fixed positions — every sample votes
into a symmetric tridiagonal normal system with hat-function weights, solved by the Thomas
algorithm per channel; then coordinate descent nudges interior offsets, refitting colors
after every move. `stopColorAt` pads like SVG `spreadMethod="pad"`.

**Stacked layers**: "the remaining error is absorbed by soft radial spot layers — a constant
color with an alpha ramp over the radius. This is the AI-safe SVG equivalent of 2-D Gaussian
splats (the GaussianImage idea), fitted greedily on the residual peak; layers composite with
plain source-over, so Illustrator imports them untouched." Alpha ramps are stored as gray
stops (`color.r` = alpha) and serialized as `stop-opacity`; the final stop is forced to fade
out at the rim.

## Color-space policy

"The SVG device space is sRGB and browsers interpolate stops there, so fitting happens in
sRGB while approximation quality is judged perceptually in Lab (ΔE2000)"
([color.ts](../../src/engine/gradient/color.ts) header). `render.ts` is the optimizer-side
twin of the browser rasterizer and must keep piecewise-linear stop interpolation — errors
measured there predict the rendered result.

## Feature & persistence

Mirrors the vector workspace exactly: worker (`GradientRequest/Response`, rgba **and** demap
buffers transferred), 200 ms debounce hook
([`src/features/gradient/use-gradient-trace.hook.ts`](../../src/features/gradient/use-gradient-trace.hook.ts)),
preview with original-vs-fitted divider **or** the ΔE heatmap ("dark red = close,
yellow/white = divergence"; disabled after a storage restore until the next fit), params
column with `GRADIENT_PRESETS` — art, flat, photo, soft, detailed, poster, duotone.
`src/state/gradient.slice.ts` sits outside undo history and autosaves into a typed
`GradientProjectEntry` (1.5 s throttle). Stats: regions, gradients, layers, vertices, ms,
mean/p95 ΔE.

## Performance characteristics

"Clustering plus per-region fitting on a 2048² source can take seconds" — hence the worker.
Fitting is sample-bounded per region; `linalg` is hand-rolled to keep the engine
dependency-free. Per-stage unit tests cover linear/radial/profile/stops/model-select math.

## Testing

Colocated in `src/engine/gradient/`:
[`pipeline.test.ts`](../../src/engine/gradient/pipeline.test.ts),
[`fit-linear.test.ts`](../../src/engine/gradient/fit-linear.test.ts),
[`fit-radial.test.ts`](../../src/engine/gradient/fit-radial.test.ts),
[`profile.test.ts`](../../src/engine/gradient/profile.test.ts),
[`stop-colors.test.ts`](../../src/engine/gradient/stop-colors.test.ts),
[`model-select.test.ts`](../../src/engine/gradient/model-select.test.ts),
[`linalg.test.ts`](../../src/engine/gradient/linalg.test.ts),
[`color.test.ts`](../../src/engine/gradient/color.test.ts),
[`compose.test.ts`](../../src/engine/gradient/compose.test.ts) — including render-oracle
checks via `fitToSvg` standalone documents; [synth.util.ts](../../src/engine/gradient/synth.util.ts)
supplies the deterministic test fields.

## Related decisions

- [vectorizer](vectorizer.md) — shared clustering/outline stages and the worker pattern.
- [research/ai-import](../research/ai-import.md) — why the AI-safe SVG subset is shaped this way.

## OpenSpec capabilities

- `openspec/changes/add-gradient-workspace/` (in-flight capability deltas: `gradient-trace`,
  `project-library`).

## Known limitations

- No mesh/patch gradients (outside the AI-safe subset).
- Heatmap is runtime-only — null after a storage restore until the next trace.
- Regions below `minRegion` paint flat even when a gradient would fit.
