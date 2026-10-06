# Vectorizer — technical notes

## Scope

Raster→SVG tracing: the TS port of the vtracer V1 pipeline (`src/engine/trace/`) plus the
vector workspace feature (`src/features/vectorizer/`) with its Web Worker. Why a TS port
instead of the Rust/WASM dependency: [ADR-0004](../decisions/0004-vtracer-ts-port.md); the
Rust/WASM policy context: [ADR-0003](../decisions/0003-rust-wasm-policy.md). The ecosystem
research behind the choice: [research/vectorization](../research/vectorization.md). The
decoded-raster input type `ImportBitmap` is shared with the import domain
([`src/engine/import/index.ts`](../../src/engine/import/index.ts)); [gradient-workspace](gradient-workspace.md)
reuses this pipeline's clustering and outline stages.

## Module map

| File | Role |
|---|---|
| [`src/engine/trace/trace.ts`](../../src/engine/trace/trace.ts) | `traceImage` facade; stages are public for hybrid pipelines |
| [`src/engine/trace/params.ts`](../../src/engine/trace/params.ts) | `TraceParams` (17 fields, vtracer option names documented), `normalizeTraceParams`, `TRACE_PRESETS` (10 style presets + 6 webapp samples) |
| [`src/engine/trace/quantize.ts`](../../src/engine/trace/quantize.ts) | hierarchical NN-chain color clustering (`MAX_LAYERS = 254`, label 255 = transparent) |
| [`src/engine/trace/binary-layer.ts`](../../src/engine/trace/binary-layer.ts) | directed edge-boundary tracing; right turn wins at diagonal joints; evenodd nesting |
| [`src/engine/trace/simplify.ts`](../../src/engine/trace/simplify.ts) | collinear merging + closed-loop RDP anchored on a farthest-point pair |
| [`src/engine/trace/fit-curves.ts`](../../src/engine/trace/fit-curves.ts) | Schneider error-bounded least-squares cubics + Newton–Raphson reparameterization |
| [`src/engine/trace/compose.ts`](../../src/engine/trace/compose.ts) | corner/splice splitting, `composeSvg` (evenodd, round caps) |
| [`src/engine/trace/mosaic.ts`](../../src/engine/trace/mosaic.ts) | V2 idea: shared boundaries fitted once, referenced by both neighbors |
| [`src/engine/trace/centerline.ts`](../../src/engine/trace/centerline.ts) | Zhang–Suen thinning + chamfer distance transform → stroke paths |
| [`src/engine/trace/parity.test.ts`](../../src/engine/trace/parity.test.ts) | structural parity vs the official vtracer WASM (dev-only oracle) |
| [`src/features/vectorizer/trace.worker.ts`](../../src/features/vectorizer/trace.worker.ts) | worker: one request = one trace |
| [`src/features/vectorizer/use-vector-trace.hook.ts`](../../src/features/vectorizer/use-vector-trace.hook.ts) | orchestration: 160 ms debounce, request ids |
| [`src/features/vectorizer/vector-workspace.component.tsx`](../../src/features/vectorizer/vector-workspace.component.tsx) | preview + params column; independent from the pixel doc |

## How it works

Pipeline (`traceImage` in [`src/engine/trace/trace.ts`](../../src/engine/trace/trace.ts)):
`clusterImage` (colors quantized to `colorPrecision` significant bits; identical pixels
collapse into leaves with real pixel sums; clusters agglomerate while mean-color distance
stays within `layerDifference` — candidate pairs from a coarse RGB grid hash make the merge
near-linear; size-weighted merge priority, deterministic tie-breaks) → layer resolution
(stacked = cluster masks painted bottom→top; cutout/mosaic = `cutoutLabels` assigns each
pixel to its topmost layer) → per-layer `traceMask` (speckle filter drops 4-connected
components below `minArea`) → hole filtering → per-layer
`normalizeLoop → simplifyLoop(lengthThreshold/2) → loopToPath` (or `mosaicPaths`) →
`composeSvg`. Stats: clusters, paths, vertices, strokes, ms.

**Web-app parity** ([visioncortex.org/vtracer](https://www.visioncortex.org/vtracer/)): the
panel mirrors the site's control surface — same defaults (speckle 4, color precision 6,
layer difference 16, corner 60, segment 4, splice 45, precision 8; Color + Stacked + Spline
on load), same slider ranges (speckle 1–16, layer difference 0–255, segment length 3.5–10,
corner/splice 0–180), and the same visibility rules: color precision/layer difference hide in
B/W mode; corner/segment/splice show only in spline mode (the centerline tracer, a project
addition, keeps its own segment-length slider). `mode: 'none'` is labelled **Pixel** like on
the site (exact cluster boundary). App-only additions beyond the site: outline/centerline
tracer choice, threshold/invert, mosaic hierarchy, hole handling, iterations, visible path
precision. The six `vt*` presets in `TRACE_PRESETS` transcribe the site's `presetConfigs`
verbatim and ship its sample images under `public/tracer/samples/` (credits there in
`CREDITS.md`) — clicking a preset card applies the settings and loads that image.

**Centerline mode** (project addition, not in vtracer): threshold → Zhang–Suen thinning →
skeleton chain extraction (degree ≠ 2 = junction/end) → simplify → cubic fitting → **stroke**
paths; per-chain width from the chamfer distance transform (`strokeWidth: 0` estimates).
"Short chains drop only when they have a free end — short bridges between two junctions are
real connectivity and must survive."

**Worker protocol** (header): "One request = one trace; responses carry the request id so
stale results from superseded parameter sets are dropped." `TraceRequest { id, width, height,
rgba: ArrayBuffer, params }` → `TraceResponse { id, svg?, stats?, error? }`; the rgba buffer
is transferred and consumed. The hook transfers a **copy** (`source.data.slice()`) because
"the source buffer must stay alive in the store (autosave reads it)"; it terminates the worker
on unmount.

## State & persistence

`src/state/vector.slice.ts` is "runtime host of the open vector project (outside undo
history)". Every change writes back into the bound `VectorProjectEntry` throttled at 1500 ms
(each save serializes a multi-MB bitmap) — `{ source, sourceName, params, svg, stats,
updatedAt }` in the `projects` store (there is no separate vector-job store; the legacy
`vectorJobs` IDB slot was promoted by the v7 migration — see [storage](storage.md)). The
workspace is fully independent of the pixel document: own import (drag-drop/file), own state
slice, own autosave; export = download or clipboard copy of the SVG. Stats line surfaces
clusters/paths · vertices · ms · kB.

## Invariants & constraints

- Clustering is deterministic (work budgets + tie-breaks by cluster index) — same input,
  same SVG, pinned by a snapshot test.
- Layer count ≤ 254; label byte 255 is reserved transparent; paint order = descending
  cluster size (big layers at the bottom).
- Evenodd throughout: hole loops have negative signed area and nest by fill rule.
- `normalizeTraceParams` clamps every field; presets are plain param bundles.

## Performance characteristics

Clustering + fitting on a 2048² source take hundreds of milliseconds — hence the worker.
Engine benches: [`src/engine/trace/trace.bench.ts`](../../src/engine/trace/trace.bench.ts).
Parity thresholds: path-count ratio ours/oracle ≤ 4×, ≥50 % of oracle fill colors within RGB
channel distance 24, plus determinism snapshot — "structural, not exact: different fitting
internals, same segmentation".

## Testing

Colocated in `src/engine/trace/`:
[`trace.test.ts`](../../src/engine/trace/trace.test.ts) + per-stage unit tests
([`params.test.ts`](../../src/engine/trace/params.test.ts),
[`quantize.test.ts`](../../src/engine/trace/quantize.test.ts),
[`binary-layer.test.ts`](../../src/engine/trace/binary-layer.test.ts),
[`simplify.test.ts`](../../src/engine/trace/simplify.test.ts),
[`fit-curves.test.ts`](../../src/engine/trace/fit-curves.test.ts),
[`mosaic.test.ts`](../../src/engine/trace/mosaic.test.ts)),
[`parity.test.ts`](../../src/engine/trace/parity.test.ts) (dev-only oracle; `@visioncortex/
vtracer` is a devDependency and never ships), bench
[`trace.bench.ts`](../../src/engine/trace/trace.bench.ts).

## Related decisions

- [ADR-0004](../decisions/0004-vtracer-ts-port.md) — the port decision and alternatives.
- [gradient-workspace](gradient-workspace.md) — reuses `clusterImage` and outline tracing.

## OpenSpec capabilities

- `openspec/specs/project-library/spec.md` (typed vector project entries); routing surface in
  `openspec/changes/add-project-home/`.

## Known limitations

- `mosaic.ts` composition is built but the workspace exposes only stacked/cutout
  hierarchical modes as first-class presets.
- Stroke color in centerline mode is hardcoded `#000000`.
- Parity is structural — exact upstream-equivalent output is not a goal.
