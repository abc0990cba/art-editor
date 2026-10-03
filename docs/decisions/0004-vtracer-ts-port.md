# ADR-0004 — Trace pipeline ported from Rust vtracer to TypeScript

- Status: accepted
- Date: 2026-10-01 (port completed 2026-09; research in `docs/research/vectorization.md`)
- Related: [vectorizer](../modules/vectorizer.md); [ADR-0003](0003-rust-wasm-policy.md); `src/engine/trace/`; [`src/engine/trace/parity.test.ts`](../../src/engine/trace/parity.test.ts)

## Context

The vector workspace needs raster→vector tracing (poster/bitmap → clean SVG). The best
open-source reference is vtracer (Rust, MIT): hierarchical color clustering, boundary tracing,
polygon simplification, Schneider curve fitting, SVG composition. Options: depend on the
official WASM build, wrap a wasm-pack build of the crate, or port the algorithm to TS.

## Decision

**Port the vtracer V1 pipeline to pure TypeScript** in `src/engine/trace/` —
`quantize.ts` (hierarchical NN-chain clustering) → `binary-layer.ts` (directed edge-boundary
tracing, right-turn at diagonal joints) → `simplify.ts` (collinear merging + closed-loop RDP
anchored on a farthest-point pair) → `fit-curves.ts` (Schneider least-squares cubics,
Newton–Raphson reparameterization) → `compose.ts` (SVG assembly). Two project-specific
additions go beyond V1: `centerline.ts` (Zhang–Suen thinning + distance transform for stroke
output) and `mosaic.ts` (shared-boundary composition, the vtracer V2 idea).

Correctness is pinned by a **dev-only parity oracle**: `@visioncortex/vtracer` (devDependency)
is instantiated in `trace/parity.test.ts` and its output compared *structurally* — path-count
ratio within 4×, ≥50 % of oracle fill colors matched within RGB channel distance 24, plus a
determinism snapshot. Structural (not exact) comparison is deliberate: "different fitting
internals, same segmentation". The oracle never ships — production tracing is 100 % TS,
executed in the vectorizer Web Worker.

## Alternatives considered

- **Ship `@visioncortex/vtracer` WASM as the production tracer** — rejected: the npm package
  ships the 1.0-alpha framework build (V1 0.6.x itself is not published); no control over
  pipeline stages; a WASM dependency in the bundle for a pipeline the ADR-0003 gate never
  justified as faster where it matters (the trace already runs off-main-thread in a worker).
- **wasm-pack build of upstream vtracer** — rejected: permanent Rust toolchain in CI and
  glue code, for the same runtime economics as above; also blocks hybrid pipelines (dithered
  rasters, pattern fills) from calling individual stages.
- **Different algorithm entirely (potrace etc.)** — rejected: vtracer's color-layer pipeline
  matches the product's poster/palette use case; the ecosystem research
  (`docs/research/vectorization.md`) surveyed alternatives before choosing.

## Consequences

- Every pipeline stage is public and callable — hybrid features (dithered raster layers as
  trace input, gradient fitting reusing `clusterImage` and outline tracing) compose stages
  directly instead of going through the facade.
- The TS port is measurable and tunable with the same vitest bench rig as the rest of the
  engine (`trace/trace.bench.ts`), and runs in the worker with the transferable-ArrayBuffer
  protocol.
- Upstream vtracer changes are *not* tracked; the port is the project's own code now, with
  the parity test as the regression net.
- The devDependency stays out of the production bundle (it is imported only by `*.test.ts`).

## Evidence

- [`src/engine/trace/trace.ts`](../../src/engine/trace/trace.ts) header — stage map and the "public stages for hybrid pipelines"
  contract.
- [`src/engine/trace/parity.test.ts`](../../src/engine/trace/parity.test.ts) header — oracle role, structural comparison thresholds.
- `docs/research/vectorization.md` — ecosystem survey and the port decision record.
- [`src/features/vectorizer/trace.worker.ts`](../../src/features/vectorizer/trace.worker.ts) — worker protocol moving the pipeline off the
  main thread.
