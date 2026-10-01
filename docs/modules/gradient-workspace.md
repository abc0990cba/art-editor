# Gradient workspace — technical notes

## Scope

Raster→vector *gradient* fitting: `src/engine/gradient/` plus the gradient workspace feature
(`src/features/gradient/`). Third project kind: the output is an AI-safe SVG of native
`linearGradient`/`radialGradient` paints — "the subset that browsers draw natively and Adobe
Illustrator imports reliably" (`types.ts` header). Shares color clustering and outline
tracing with the vectorizer.

## Module map

| File | Role |
|---|---|
| `src/engine/gradient/pipeline.ts` | `traceGradientImage` facade + ΔE heatmap |
| `src/engine/gradient/segment.ts` | region extraction from quantizer labels, `regionPixels`, `maskPath` |
| `src/engine/gradient/fit-linear.ts` | weighted affine regression → Jacobian → principal eigenvector = gradient direction |
| `src/engine/gradient/fit-radial.ts` | weighted least-squares intersection of iso-color normals + Huber IRLS |
| `src/engine/gradient/profile.ts` | binned weighted medians → perceptual RDP → candidate stop offsets |
| `src/engine/gradient/stop-colors.ts` | Thomas-algorithm tridiagonal solve for exact stop colors + coordinate-descent refinement |
| `src/engine/gradient/layers.ts` | 'stacked' mode: residual spots as AI-safe Gaussian-splat equivalents |
| `src/engine/gradient/model-select.ts` | solid → linear → radial by ΔE tolerance; quadratic smoothness gate |
| `src/engine/gradient/linalg.ts` | hand-rolled Gaussian elimination, 2×2 eigen, Thomas — engine stays dependency-free |
| `src/engine/gradient/color.ts` | sRGB↔Lab (D65), ΔE2000 |
| `src/engine/gradient/render.ts` | mathematical renderer matching browser stop interpolation |
| `src/engine/gradient/compose.ts` | AI-safe SVG serialization (`userSpaceOnUse`, hex stops, no blend modes) |
| `src/features/gradient/gradient.worker.ts` | same worker protocol as the trace worker + demap transfer |

## How it works

`traceGradientImage(bitmap, params)`: `clusterImage` (trace defaults, `layerDifference: 0`)
→ per region: `maskPath` (trace-engine outline) + `regionPixels`; regions below `minRegion`
stay flat ("so the image stays opaque"), else `fitRegion` → optional stacked spot layers →
paths: base fill `url(#gN)` + one same-`d` path per spot layer `url(#sN)`, painter-stacked.
Also emits a downsampled ΔE heatmap (`ΔE2000 × 8`, stride 4) for the preview's divergence
view.

**Model selection** (`model-select.ts`): fit solid → linear → radial; keep the simplest model
whose mean ΔE2000 stays within tolerance; a quadratic color-surface regression gates on
smoothness ("on non-smooth fields gradient models are meaningless").

**Linear fit**: weighted affine regression of each channel over (x, y) gives a color
Jacobian; the principal eigenvector of JᵀJ is the gradient direction (λ2/λ1 says how 1-D the
field is); samples project onto that axis; axis oriented toward increasing color; geometry
anchored so stop offsets and SVG coordinates share one system.

**Radial fit**: iso-color lines of a radial gradient are circles, so image gradients point
at/away from the center; the weighted least-squares intersection of those lines (normals ⊥
gradient, Huber-reweighted, 3 IRLS iterations) yields the center; parallel (linear) fields
are detected and rejected. Sobel on box-blurred luminance supplies gradients.

**Stops**: positions from `profile.ts` (tolerance doubles until ≤ maxStops); colors solved
exactly for fixed positions — every sample votes into a symmetric tridiagonal normal system
with hat-function weights, solved by the Thomas algorithm per channel; then coordinate descent
nudges interior offsets, refitting colors after every move. `stopColorAt` pads like SVG
`spreadMethod="pad"`.

**Stacked layers** (`layers.ts`): "the remaining error is absorbed by soft radial spot layers
— a constant color with an alpha ramp over the radius. This is the AI-safe SVG equivalent of
2-D Gaussian splats (the GaussianImage idea), fitted greedily on the residual peak; layers
composite with plain source-over, so Illustrator imports them untouched." Alpha ramps are
stored as gray stops (`color.r` = alpha) and serialized as `stop-opacity`; the final stop is
forced to fade out at the rim.

## Color-space policy

"The SVG device space is sRGB and browsers interpolate stops there, so fitting happens in
sRGB while approximation quality is judged perceptually in Lab (ΔE2000)" (`color.ts` header).
`render.ts` is the optimizer-side twin of the browser rasterizer and must keep piecewise-
linear stop interpolation — errors measured there predict the rendered result.

## Feature & persistence

Mirrors the vector workspace exactly: worker (`GradientRequest/Response`, rgba **and** demap
buffers transferred), 200 ms debounce hook, preview with original-vs-fitted divider **or**
the ΔE heatmap ("dark red = close, yellow/white = divergence"; disabled after a storage
restore until the next fit), params column with `GRADIENT_PRESETS` (7). `gradient.slice.ts`
sits outside undo history and autosaves into a typed `GradientProjectEntry` (1.5 s throttle).
Stats: regions, gradients, layers, vertices, ms, mean/p95 ΔE.

## Performance characteristics

"Clustering plus per-region fitting on a 2048² source can take seconds" — hence the worker.
Fitting is sample-bounded per region; `linalg` is hand-rolled to keep the engine
dependency-free. Per-stage unit tests cover linear/radial/profile/stops/model-select math.

## Testing

`pipeline/fit-linear/fit-radial/profile/stop-colors/model-select/linalg/color/compose
.test.ts` — including render-oracle checks via `fitToSvg` standalone documents.

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
