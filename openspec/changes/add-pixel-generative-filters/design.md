# Design: add-pixel-generative-filters

## Context

Selection effects are pure transforms over a sparse ink snapshot (`Map<index, InkCell { v, o }>`,
`selection-xform.ts`): warp / stylize / morpho each define ops + params + a dispatcher, and the
effect slice bakes the mapped ink through `bakeSelection`. The metaball field math already exists
(`geometry/metaball-field.ts`) but only feeds the SVG render mode; fill patterns
(`texture/fill-patterns.ts`) and cell-shape hit tests (`cell-shapes/geom.ts`) exist but are only
reachable through the non-destructive fill / brush styling paths. The new filters wire those three
machineries into the destructive selection pipeline.

## Decisions

- **One op family, one slice action.** `filters.ts` defines `FilterOp` (six ids), the merged
  `FilterParams` + `DEFAULT_FILTER_PARAMS` (the morpho pattern: one params interface, ops read
  their own fields), chip const lists for the UI, and the `filterInk()` dispatcher. The slice
  action `filterSelection(op, params?)` mirrors `pixelOpSelection` (same guards, same
  `bakeSelection` plumbing, palette untouched).
- **Blobify reuses the metaball kernel, not the render pipeline.** Per ink cell a single kernel
  splat `t = 1 − d²/R²`, `f += t^power` (power: tight 3 / smooth 2 / gooey 1, `FALLOFF_POWER`
  semantics mirrored locally — importing the render builder would drag marching-squares along).
  Radius is a direct cell measure (1..8), iso clamped to 0.2..0.9 like `metaballIso`. Every
  original ink cell trivially survives (its own kernel is 1 ≥ iso); empty cells join where the
  summed field reaches iso. Added cells take value+owner of their strongest single contributor
  (per-cell running max), so two-color selections fuse without color shuffling.
- **Smoothen is the additive complement of `pixelPerfect`.** pixelPerfect trims stair corners;
  smoothen fills them: an empty cell becomes ink when the other three cells of any of its 2×2
  blocks are inked (any values). Passes run 1..3, each judged against the previous pass. No
  convex trimming — that would duplicate pixelPerfect.
- **Figurefy anchors blocks at the selection box origin** (`(x − box.x0) · k + box.x0`) so the
  mosaic grows down-right predictably and clips at the buffer edge; sub-cell centers sample
  `cellShapeHit(figure, (i+0.5)/k, (j+0.5)/k, DEFAULT_SHAPE_PARAMS)`. `cut` mode inverts the hit
  mask over a full k×k block. Value+owner inherit from the source cell.
- **Patternize delegates entirely to `patternAt`** with absolute buffer coordinates (patterns flow
  continuously across selections, matching fill behavior), `density` as the `t` threshold,
  `scale` as the tile multiplier, `invert` flipping the keep-mask. The exposed pattern subset is
  the structured families (checker, grid, hatch, stripes ×3, dots, bricks, rings, zigzag) — the
  dither-threshold families (bayer/cluster/noise/…) belong to the fill tool, not to silhouette
  masking.
- **Drip emits from run ends only.** A source cell with no source-ink neighbor along the drip
  direction starts a trail; per trail length `L = round(length · (1 − variation + variation ·
  hash2(col, end, seed)/2³²))` varies smoothly between `length·(1−variation)` and `length`.
  Trails walk through empty cells only (source ink stops them), so trails from parallel runs merge
  into curtains instead of overwriting.
- **Dissolve gates on one noise sample per cell.** Scale 1 → pure per-pixel `hash2` scatter;
  scale > 1 → `valueNoise(x/scale, y/scale, seed)` clumps the holes. Amount 0..0.95 (never
  total). Deterministic per (x, y, seed).
- **Preview plumbing is extracted once.** `selectionInk` moves from `effect.slice.ts` into
  `selection-xform.ts` as `selectionInk(cells, cellObj, ids)`; a new
  `use-selection-ink-preview.hook.ts` owns snapshot-once + ghost paint + ghost cleanup over the
  staging surface. The warp popover refactors onto it and the new filter popover uses it directly —
  the snapshot logic existed twice already, a third copy was not acceptable.
- **Mixed UI depth.** Blobify / figurefy / patternize have interacting continuous params → they
  open a live-preview popover (warp pattern: ghost repaints per tick, Apply commits one undoable
  action). Smoothen / drip / dissolve read fine as presets → inline chip rows in the menu
  (pixel-ops pattern: ×1/×2/×3 passes, ↓/↑/←/→ directions, 25/50/75 %).

## Risks / Trade-offs

- Blobify is O(ink · R²) kernel splats plus an O(box · R) field scan — selection-sized, like the
  other bakes; radius is capped at 8 so worst-case splats stay bounded.
- Figurefy multiplies the ink footprint by k² (clipped at the buffer edge) — inherent to the op's
  premise; the box-anchored placement keeps the growth direction predictable.
- Patternize on absolute coordinates means the same selection re-filtered after a 1-cell move
  picks a different phase — consistent with how fills behave and arguably correct.
