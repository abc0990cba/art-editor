# Research: raster→vector tracing (vtracer V1 and around it)

Why this document exists: the editor gained a second workspace mode — "Vector", tracing
images to SVG modeled on vtracer V1, with an eye toward hybrid pipelines with dithering.
Recorded here: the V1 pipeline, the ecosystem state, the relevant literature, the A/B hybrid
scenario design, and the architecture decisions. This is a living document — translated to
English and updated 2026-10-01 (implementation status in §7 reflects the current code;
storage facts corrected to the v7 schema).

## 1. The vtracer V1 pipeline (reference, MIT, Rust)

A fully linear pipeline (unlike potrace, which globally optimizes the polygon):

1. **Hierarchical agglomerative color clustering** (`color_clusters::Runner`) — not k-means:
   leaves are runs of identical pixels, pairs merge on minimal color distance in a heap.
   Controlled by `color_precision` (significant bits per channel — quantization before
   merging) and `layer_difference` (the distance threshold under which pairs merge). The
   result is a merge tree; a threshold "slice" yields the layers.
2. **One binary layer per cluster**: the cluster's pixel mask (+ holes as separate
   components). Contours are traced by boundary-following with a **turning policy**
   (resolving ambiguous diagonal joints); holes become nested contours (Suzuki–Abe-style
   hierarchy).
3. **Polygon simplification**: "staircase-symmetric" Ramer–Douglas–Peucker (symmetry so
   diagonal staircases simplify consistently in both directions); threshold =
   `length_threshold`.
4. **Curve fitting**: corner detection (`corner_threshold`) → between corners,
   least-squares fitting of cubic Béziers per Schneider (Graphics Gems FitCurves:
   chord-length parameterization, Newton reparameterization, bounded by `max_iterations`),
   splits on error overshoot, smooth-segment splicing (`splice_threshold`).
5. **Composition**: `stacked` — layers painted over each other (holes "show through" to
   lower layers; robust to seams, but lower paths contain hidden area); `cutout` — every
   visible region belongs to exactly one path (easier to edit, but hairline anti-aliasing
   seams are possible at borders).
6. **SVG writer**: compound paths with fill-rule evenodd (holes as subpaths), coordinate
   precision `path_precision`.

V1 parameters (0.6.x defaults): `colormode` color|binary; `hierarchical` stacked|cutout;
`mode` spline|polygon|none; `filter_speckle` 4; `color_precision` 6; `layer_difference` 16;
`corner_threshold` 60°; `length_threshold` 4.0; `max_iterations` 10; `splice_threshold` 45°;
`path_precision` 8.

V2 (1.0.0-alpha, 2026) — same core, rewritten as a pipeline of pluggable stages, plus:
watershed clustering, seam-free "mosaic" cutout (a shared edge of adjacent regions is fitted
once — no seams), Bradley–Roth adaptive threshold, fixed palettes (OKLab matching),
paper.js-style curve re-simplification.

## 2. Ecosystem and availability

- The official npm `@visioncortex/vtracer` is WASM, but only versions **1.0.0-alpha.\*** (V2)
  exist; V1 (0.6.x) was **never published** to npm. It is built for Node
  (`--target nodejs`), so: it works as-is in vitest (the parity oracle in tests), but is not
  browser-ready without a rebuild.
- No Rust toolchain for our own WASM: V1 is ported to TS honestly (the core — clustering +
  tracing + fitting — is on the order of a couple thousand lines). See
  [ADR-0004](../decisions/0004-vtracer-ts-port.md) and
  [ADR-0003](../decisions/0003-rust-wasm-policy.md).
- For manual comparison with "real" V1: the visioncortex web demo, the `vtracer-cli` cargo
  binary, Python `vtracer==0.6.x` (PyPI).

## 3. Related methods and literature

| Method / source | Idea | Role here |
|---|---|---|
| **Potrace** (Selinger 2003; paper free, code GPL — not linked) | trace → polygon → corners → global curve optimization | canon for ambiguous-vertex turning and corner handling |
| **imagetracerjs** (public domain, JS) | quantize → layers → edge nodes (marching-squares variant) → pathscan → divide & conquer fit (line → quadratic) | reference for a simple JS pipeline; our fitter is stronger (Schneider cubics) |
| **Suzuki–Abe 1985** (OpenCV findContours) | border following + contour hierarchy vector | holes / "no holes" (`holes: keep|fill`) |
| **Marching squares** (+ d3-contour) | iso-contours over 2×2 | already in the project (metaball/outline) |
| **RDP / Visvalingam–Whyatt** | polyline simplification | RDP for V1 parity; VW as an aesthetics option |
| **Schneider FitCurves** (Graphics Gems; JS port `fit-curve`) | error-bounded least-squares cubics | the fitter for both tracers (outline + centerline) |
| **Zhang–Suen 1984 / Guo–Hall 1989** | thinning (skeletonization) | the centerline mode for line art |
| **SLIC superpixels** (TPAMI 2012) | k-means in labxy | not needed for V1; a candidate for "regional" photo segmentation |
| **Im2Vec / LIVE / Deep Vectorization** (CVPR'21/22, TPAMI) | ML vectorization via a differentiable rasterizer | out of scope: minutes of GPU per image; survey: arXiv 2306.06441 |

Conclusion: for the browser and our integration, the classic pipeline is the right tool; ML
approaches remain context.

## 4. Extensions beyond bare V1 (phase-1 scope)

- **holes: keep \| fill** — keep = V1 parity (evenodd subpaths); fill = nested contours
  (Suzuki–Abe children) skipped, area filled solid. For many purposes (and for later texture
  layering) working with holes is inconvenient.
- **hierarchical: cutout** — each region in one path, no overlaps; **mosaic** — shared edges
  of adjacent regions fitted once (no seams; a V2 approach implementable on V1 stage
  outputs: edges traced with keys, adjacent paths sharing the fitted curves).
- **centerline mode** — threshold → Zhang–Suen → skeleton graph (junctions/ends) → chains →
  RDP → Schneider → SVG *strokes*; stroke width from the distance transform (auto) or fixed.
  For scanned line art this is the only sensible output (outline fuses parallel strokes into
  blobs).
- **"masks instead of RGBA" input** — the facade accepts either a raster (it clusters) or
  ready color-mask layers. The key to scenario A: a dithered document is already quantized —
  per-palette-color masks go straight into tracing.
- **Presets** — built-in (default/photo/poster/bw/pixel/lineart/logo/sketch/comic/antique) +
  user presets in IndexedDB.

## 5. Hybrid scenarios (phase 2, design)

**A. Dithering → vector.** Import-with-dithering produces a paletted raster; tracing it
head-on spawns thousands of speckle clusters. The right path: masks per palette color →
tracing that skips clustering; region boundaries become grid-snapped RLE rectangles/contours
(pixel-perfect, tiny SVG); optionally the dither pattern itself is encoded as a `<pattern>`
fill (regions stay vectors, texture is a tile), compressing the file by orders of magnitude.
The hooks are in place: mask input, defs in compose.

**B. Line art + dither textures.** Scanned line art → centerline (strokes as stroke-paths);
textures from the pixel mode → dithering → masks → tracing (or `<pattern>`); both results
assemble into one SVG: vector strokes over pattern fills. Both pipelines publish intermediate
stages, so assembly is a feature-level task, not an engine one.

## 6. Implementation decisions

- Engine: pure TS in `src/engine/trace/` (stages are public functions, ≤400 lines/file);
  the worker lives in the feature. No Rust/WASM in the runtime.
- Reference in tests: `@visioncortex/vtracer@1.0.0-alpha.4` (Node build, vitest),
  structural comparison (layers/colors/paths ± tolerances) in the default V1-like mode;
  our own snapshots are the regression shield.
- State: global-store slices (`vector`, `vector-presets`); work autosave + presets in
  IndexedDB.
- UI: a Pixels \| Vector workspace switch (vector/gradient workspaces reached from the home
  screen as typed projects); workspace = center preview + right parameter column; mobile =
  drawer.

## 7. Implementation status (2026-09-27; storage facts updated 2026-10-01)

Implemented and verified (all gates green, UI checked in the browser):

- Engine `engine/trace/`: `params` (V1 parameters + holes + centerline + presets), `quantize`
  (NN-chain agglomeration with size-weighted merge distance — this yields the vtracer
  behavior "small merges into large, gradients collapse"), `binary-layer` (speckle filter +
  boundary walk with turning policy, holes by signed area), `simplify` (normalize +
  start-vertex-stable closed RDP), `fit-curves` (Schneider FitCurves), `compose`
  (corners/soft anchors/splines, SVG writer with a defs hook), `mosaic` (shared edges of
  adjacent regions fitted once), `centerline` (Zhang–Suen + 2×2 pruning to 1 px, chamfer
  distances for stroke width, skeleton chains; short bridges between junctions survive — a
  ring is not torn), facade `trace` (input: raster or ready layer masks — the scenario-A
  hook).
- Parity: `parity.test.ts` against the WASM oracle on three fixtures (disc/bands/gradient) +
  a determinism snapshot.
- State/storage: `vector.slice`, `vector-presets.slice`; sessions persist as typed **vector
  project entries** in the `projects` store (DB v7). *Update 2026-10-01:* the original
  design's dedicated `storage/vector-job` slot was collapsed into typed project entries by
  the v7 schema; the legacy `vectorJobs` IDB store survives only as the migration source.
  Reload-recovery verified in the browser.
- Worker: `features/vectorizer/trace.worker.ts` (tracing off the main thread, transferable
  buffers, stale runs dropped by request id).
- UI: vector/gradient workspaces as typed projects from the home screen (per
  `add-project-home`), preview with zoom/pan/fit + ResizeObserver, original-vs-result
  comparison, checkerboard; parameter panel with sections and presets; drag-drop/paste/click
  import (routed by project kind); SVG export + copy; i18n en/ru.
- Scenario-A bridge: the "Vectorize" action in the export popover renders the canvas and
  hands it to a new vector project (`use-vectorize-bridge`); the mask-input test
  (`traces dithered-palette masks directly`) proves dither tracing that skips clustering.

Deliberate phase-1 simplifications (see §4–5): centerline strokes are always black; mosaic
splits closed shared contours at x-extremums; exporting dither as `<pattern>` fills and a
path editor are phase 2 (hooks in place).
