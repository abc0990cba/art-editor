# Design: add-pixel-stylization-pack

## Context

The metaball field builder (`engine/geometry/metaball-field.ts`) splats every painted sub-cell
with the same global kernel radius — the blob size of a painted area is therefore independent
of how it was painted, which reads as "metaballs only work on single pixels" when the brush
pixel size grows. The field builder is position-based, so the fix is per-source, not a new
pipeline.

## Decisions

- **Per-source kernel radius.** `MetaballSource`/`MetaballCapsule` gain an optional `r`
  multiplier; `buildMetaballField` multiplies it into the base `kernelRadius(strength, sub)`.
  At the default iso/strength the visible blob radius is ≈0.46× the kernel radius, so the
  block kernel multiplier is the block edge `n` — a block blob's edge lands right around its
  own cell border. No new field pipeline; diffusion guides and both metaball call sites
  inherit block units for free.
- **Only complete blocks collapse.** A block kernel replaces its cells only when every buffer
  cell of the aligned n×n block is painted in one color; incomplete/mixed blocks keep classic
  per-cell kernels. This preserves the documented mixed-pixel-sizes model (a stray 1×1 pixel
  stays a small blob that merges into nearby big ones) and keeps the semantics predictable
  with the block-snapping brush.
- **Capsules bridge adjacent blocks.** Edge-adjacent same-value blocks emit a capsule between
  their centers (with the same swollen radius), guaranteeing a fat metaball neck independent
  of strength. Non-adjacent blocks never bridge.
- **fuseAll is a dispatch-level bypass.** `fusesAll(doc)` (metaball mode ∧ `metaball.fuseAll` ∧
  plain square) short-circuits `buildGeometry`/`sceneGeometry` into one `metaballGeometry` call
  over the synced composite (`mergedCells`), skipping element grouping and per-layer isolation.
  The doc-level metaball settings shape the whole field; `perColor` still splits by color.
- **One mode dispatch.** `geometry/mode.ts` exports `squareModeGeometry`, the single
  render-mode → builder map used by the global, scene and element-scope build paths, so the
  two new modes cannot drift between scopes. It also relieved the `sceneGeometry` complexity
  ratchet.
- **Stroke paths were already supported.** `StyledPath` carried optional `stroke`/`strokeWidth`
  and both output renderers drew them; contour mode only needed to emit them.
- **Extrude is a body-under-fill pass.** A per-build mask collects, for every painted cell, the
  first `depth` empty cells along the direction (stopping at bounds and at any painted cell);
  the mask emits one run-merged rect path in the body color BEFORE the regular pixels-mode
  fill. Element-frozen like every style block (`elementStyleKey`, `sameExtrude`).
- **Pixel ops are pure ink-map functions.** `engine/effects/morpho.ts` mirrors `stylize.ts`:
  ops over `Map<number, InkCell>` returning replacement or merged maps, baked through the
  existing `bakeSelection` plumbing in `effect.slice.ts`. Shrinking ops replace wholesale;
  additive ops (dilate, longShadow, scanlines) merge over the source. Recoloring ops
  (silhouette/longShadow/scanlines) resolve the current color; pure morphology ops never touch
  the palette.
- **Hex-family lattices mirror the pointy builder.** `hexFlat` swaps the pointy-top axes
  (odd-q offset); `rhombille` is a compound lattice in the octasquare pattern — hex cell `h`
  owns lozenge faces `3h`, `3h+1`, `3h+2`, each the rhombus (V2f, V2f+1, V2f+2, center). The
  hit test reuses hex cube rounding and then picks the 120° sector by angle. Round-trip tests
  probe in-face points, not the shared center.
- **Hit-test fix (bug found on the way).** `Math.abs(rz - -qf - rf)` parses as `rz + qf - rf`
  (precedence), corrupting the cube-rounding tie comparison; the missing final `else` left
  invalid cubes (x+y+z ≠ 0) on exact ties. Fixed in the pointy builder too — a real
  correctness fix the rotated-grid round-trip tests now cover.

## Risks / Trade-offs

- Block-unit metaballs make `collectSquareSources` scan blocks in addition to cells — O(cells)
  unchanged, small constant overhead.
- `fuseAll` restyles old ink (doc-level settings apply to everything) — that is its purpose;
  it stays opt-in and square-only.
- `pixelPerfect` uses the any-value neighbor test (like `outlineInk`), so touching different
  colors also count — consistent with the existing stylize ops.
