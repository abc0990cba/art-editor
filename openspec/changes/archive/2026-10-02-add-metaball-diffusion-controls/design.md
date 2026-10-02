# Design: add-metaball-diffusion-controls

## Field model (`src/engine/metaball-field.ts`, new)

One builder serves both square and non-square metaball paths. Sources are expressed in **doc
units** so the grid-specific coordinate math collapses into two thin adapters.

```ts
export type MetaballFalloff = 'smooth' | 'soft' | 'tight'
export interface MetaballSource { x: number; y: number; v: number }
export interface MetaballCapsule { ax: number; ay: number; bx: number; by: number; v: number }
export interface MetaballField { f: Float32Array; fw: number; fh: number; scale: number }

export function kernelRadius(strength: number, sub: number): number
export function falloffPower(falloff: MetaballFalloff): number   // smooth 3, soft 2, tight 1
export function metaballIso(doc: Doc): number                    // clamp(doc.metaball.iso, 0.2, 0.8)
export function buildMetaballField(opts: {
  w: number; h: number                       // doc extent to cover
  sources: MetaballSource[]                  // cell centers (+ junction kernels), doc units
  capsules: MetaballCapsule[]                // links as capsules, doc units
  take: (v: number) => boolean
  strength: number; quality: number
  falloff: MetaballFalloff; sub: number
  squareEdges: boolean
  maxSide: number                            // node cap on the long side (preview vs commit)
}): MetaballField
```

- Kernel: `t = 1 - d²/R²; f += Math.pow(t, falloffPower(falloff))` with
  `R = kernelRadius(strength, sub) / step` — identical math to today, exponent parameterized.
- Border handling (zero ring vs mirrored under `squareEdges`) moves into the builder verbatim.
- `quality` semantics unchanged (`q = clamp(quality, 1, maxSide/max(w,h))`).

### Adapters

- **Square** (`geometry-metaball.ts`): scans the buffer as today, emitting one source per
  painted cell at `((bx + 0.5) / sub, (by + 0.5) / sub)`; corner-connectivity junction kernels
  stay a square-side concern and are appended as extra sources; links become capsules in doc
  units. Per-color iteration, dominant-color fallback, texture fragments and `loopsToPath`
  remain here — only field construction and the `ISO` constant are replaced
  (`marchingSquares(..., metaballIso(doc))`).
- **Non-square** (`grid-geometry.ts` `gridMetaball`): sources are `grid.center(i)` per group
  cell; capsules are the doc links **filtered by the group's value** (fixes today's cross-color
  link bleed), extent `w/h` from the grid, `scale = step` as today. Gains iso + falloff for
  free; `loopsToDocPath` is deleted in favor of the square module's identical helper (re-export
  from `metaball-field.ts` as `loopsToSmoothPath`).

## Document model

- `Doc.metaball` gains `iso: number` (default 0.5) and `falloff: MetaballFalloff`
  (default `'smooth'`); `defaultMetaball` updated.
- Tolerant load: `project-parse.ts` clamps `iso` into 0.2–0.8 (missing → 0.5) and whitelists
  `falloff` (missing → `smooth`), mirroring the existing `quality` clamp.
- Presets: `normalizePresetConfig` clamps/defaults the same two fields next to `quality`.
- Style identity: `sameElementStyle` (`doc-style.ts`) and `elementStyleKey`
  (`geometry-elements.ts`) enumerate the two new metaball fields so element-scope restyling
  invalidates correctly.

## Overlays (`canvas-stage.component.tsx`)

One UI toggle drives all three aids: `showDiffusionGuides: boolean` in `ui.slice.ts` (default
false; the toggle is rendered only when `doc.renderMode === 'metaball'`).

- **Threshold contour** — memoized on `[doc ref]`: the engine's `metaballOverlayContours(doc)`
  (`geometry.ts`) mirrors the scene dispatch — per visible layer it merges object ink into a
  scratch buffer and traces the merged field via `metaballPreviewField` (square) or
  `gridMetaballField` (non-square), so scene docs are covered. Global style scope only:
  element-scoped ink freezes its own render mode, so a doc-level merged contour would be
  meaningless there (recorded limit). Loops become one combined `Path2D` (via `Path2D(d)`), and
  `strokeDiffusionContour` strokes it with the stage theme's `fieldContour` color, width
  `1.25/zoom`, `setLineDash([4/zoom, 3/zoom])`. Skipped when zoom < 2 (the blob is unreadably
  coarse below that); during a stroke the committed contour may lag one stroke behind — it
  repaints on commit.
- **Half-cell grid** — square-grid branch of `gridLinePaths` gains a `half` `Path2D` at pitch
  `1/(2·sub)` built under the same memo as the other line paths, drawn in the existing
  `pixelLine` style only when diffusion guides are on and metaball mode is active.
- **Kernel ring** — in the hover overlay pass (`draw-tool-hover.util.ts` consumers), when
  metaball mode + guides are on and the cursor is over a paintable cell, stroke a circle at the
  cell center with radius `kernelRadius(doc.metaball.strength, doc.sub)` doc units, same accent
  style as the contour.
- **Themes** — `stage-themes.ts` gains `fieldContour` per theme (accent-family color readable
  on all seven themes); overlays stay canvas-only, so SVG/PNG export is untouched.

## Persistence

Overlay preferences follow the ui-slice's existing localStorage-key pattern (like theme/lang/
rail): `glyph.grid` (showGrid, `'0'` = off), `glyph.gridEmphasis` (0–16) and
`glyph.diffusionGuides` (`'1'` = on) are written by their setters and read by `initial*`
helpers on store creation. The zundo `partialize` (undo-history scoping) stays doc-only.

## UI

Style section, metaball group (after `strength`): threshold slider 0.20–0.80 step 0.01 (shown
as %), falloff chip row (`smooth`/`soft`/`tight`). Quality chips gain `ultra` = 8. Canvas
section gains the "Diffusion guides" `CheckRow` (metaball mode only). i18n: `metaball.iso`,
`metaball.falloff`, `metaball.falloff.smooth|soft|tight`, `metaball.quality.ultra`,
`canvas.diffusion` in `en.messages.ts` + `ru.messages.ts`.

## Testing

- `metaball-field.test.ts` (new): falloff powers order field values at the same probe point
  (`tight > soft > smooth` in the skirt); iso clamp; squareEdges mirror; capsule value filtering.
- `geometry.test.ts`: metaball blob area grows when iso drops (same cells), square and non-square
  paths both honor iso/falloff (grid blob equals square blob for equivalent single-cell input).
- Project round trip with `iso`/`falloff`; preset normalize clamps out-of-range values.
- Elements: restyle invalidation covers the new fields (`elements.test.ts`).
- Browser smoke: metaball doc → guides on → contour follows strokes live; half-grid on square;
  ring follows cursor; export contains no guides; reload restores overlay toggles.
