# Tasks: add-pixel-generative-filters

## 1. Engine

- [ ] 1.1 `engine/effects/gooey.ts`: `blobifyInk` (kernel splats, iso threshold, strongest
      contributor attribution), `smoothenInk` (concave corner fill passes)
- [ ] 1.2 `engine/effects/figures.ts`: `figurefyInk` (box-anchored k×k blocks over
      `cellShapeHit`, figure/cut modes), `patternizeInk` (`patternAt` mask, density/scale/invert)
- [ ] 1.3 `engine/effects/organic.ts`: `dripInk` (run-end trails, hash-varied length),
      `dissolveInk` (hash / value-noise gating)
- [ ] 1.4 `engine/effects/filters.ts`: `FilterOp`, `FilterParams` + defaults, chip const lists,
      `filterInk()` dispatcher; `selectionInk` moved into `selection-xform.ts`
- [ ] 1.5 Colocated tests: pixel-exact fixtures per op (fusion, rounding, figure masks, pattern
      masks, trail lengths, gate exactness), determinism pins

## 2. Store

- [ ] 2.1 `filterSelection(op, params?)` in `effect.slice.ts` via `bakeSelection`; `State`
      declaration in `editor.store.ts`

## 3. UI

- [ ] 3.1 `use-selection-ink-preview.hook.ts`; warp popover refactored onto it
- [ ] 3.2 `selection-filter-popover.component.tsx`: blobify / figurefy / patternize with live
      ghost preview (radius, iso, falloff / scale, figure icons, mode / pattern, scale, density,
      invert)
- [ ] 3.3 `selection-fx-menu.component.tsx`: gooey / figures / organic groups; preset chip rows
      for smoothen (passes), drip (directions), dissolve (amounts)
- [ ] 3.4 i18n EN/RU: group titles, op names + descriptions, param labels; reuse
      `fill.pattern.*` keys for the pattern picker

## 4. Docs and gates

- [ ] 4.1 `docs/modules/effects.md` module map + how-it-works sections; engine-map row wording
- [ ] 4.2 Full gate green (format / lint / arch / knip / tsc / test) after every part
