# ADR-0009 — One metaball field builder; threshold and falloff as product controls

- Status: accepted
- Date: 2026-10-02
- Related: [geometry module](../modules/geometry.md); `openspec/specs/metaball-rendering/spec.md`;
  change `openspec/changes/archive/2026-10-02-add-metaball-diffusion-controls/`

## Context

Metaball mode splats kernels into a scalar field and traces it with marching squares. Two
independent implementations existed: `geometry-metaball.ts` (square buffers) and a duplicated
splat/capsule loop inside `grid-geometry.ts` (`gridMetaball`). The merge threshold (ISO) was
hardcoded 0.5, the kernel falloff hardcoded cubic, and the non-square path splatted every
link into every color's field. Users could not see where the field would cross the threshold,
which made diffusion placement guesswork.

## Decision

1. **One field builder** — `engine/metaball-field.ts`. Sources and capsules arrive in doc
   units; grid-specific coordinate math stays in two thin adapters (square: buffer scan +
   junction kernels; non-square: `grid.center` sources with links filtered by the group's
   value). Quality/preview resolution folds into the node pitch `step`; `squareEdges` border
   mirroring is a builder flag.
2. **Threshold and falloff are document settings**, not constants: `metaball.iso`
   (0.2–0.8, default 0.5) and `metaball.falloff: 'tight' | 'smooth' | 'gooey'` mapping to
   kernel power `3 | 2 | 1`. Naming follows the visible effect — *gooier reaches further* —
   not the exponent; the default `tight` preserves the historical cubic rendering exactly.
3. **Diffusion guides are overlays, never geometry**: the threshold contour
   (`metaballOverlayContours`, one dashed line per visible layer), the half-cell grid pitch
   and the kernel-radius ring live in canvas drawing (`features/canvas/diffusion-guides.util.ts`,
   `grid-overlay.util.ts`) and cannot reach SVG/PNG export. Overlay preferences persist via
   ui-slice localStorage keys, not the undo-history partialize (zundo owns that field list —
   persisting UI state there would put view toggles into the undo stack).

## Consequences

- Metaball behavior changes land in one file; square/non-square parity is testable
  (`metaball-field.test.ts` asserts both grids honor iso/falloff).
- The overlay contour is global-scope only — element-scoped ink freezes its own render mode,
  so a doc-level merged contour would lie. Recorded as a known limit.
- Style identity (`sameElementStyle`, `elementStyleKey`) enumerates the new fields; projects
  and presets clamp them on load.

## Alternatives considered

- Parameterizing the two existing field builders separately — rejected: the duplication was
  already drifting (link filtering differed).
- Exposing a raw falloff exponent — rejected: three named curves communicate the visual
  result; a bare power invites meaningless values and unshippable extremes.
