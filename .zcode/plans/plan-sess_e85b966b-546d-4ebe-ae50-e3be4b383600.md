 implement a slice of the idea catalog, using the recommended interaction model (parameter popovers with live preview; simple ops one-click).

## Phase 1 — Warp engine (pure domain, no React)
- New `src/engine/warp-field.ts` + `src/engine/warp-preset.ts` (kebab-case engine modules, each well under the 400-line cap):
  - Core `warpCells(ink: Map<index, value>, bbox, preset, params) -> Map<index, value>` — inverse mapping: for each target cell compute a source position via the field function, nearest-sample the ink. Same inverse-sampling philosophy as `src/engine/selection-xform.ts` (`mapInk`).
  - Presets: `bulge`, `pinch` (one field, amount sign), `fisheye`, `twirl` (reuse the radial-symmetry twist math), `wave` (H/V), `zigzag`, `polar` (rect↔polar), `roughen` (seeded via existing `hash2`). Deterministic: no `Math.random`.
- Tests `warp.test.ts`: amount=0 → identity; determinism (same seed ⇒ same output); bbox clamping; cell-count preservation outside the effect radius; no dropped/renamed palette values.

## Phase 2 — Stylize ops (pure domain)
- New `src/engine/stylize.ts`: `outlineInk` (4/8-neighborhood dilation, current color), `dropShadowInk` (dx/dy dark copy), `glowInk` (dilated rings toned by bayer/blue-noise from `dither-matrices.ts`).
- Tests: outline of empty ink = empty; glow uses only existing palette indices; shadow offset correctness.

## Phase 3 — Node mod for non-destructive warps
- New `src/engine/nodes/warp.node.ts` — one `defineNode` `mod.warp` (kind select + amount/center/radius/angle/wavelength/seed params, per-kind clamping per the registry schema pattern in `transforms.node.ts`). Graph-driven objects get live, re-editable warps automatically; nodes UI/presets/tests pick it up from the registry.

## Phase 4 — Store wiring (bake path, undoable)
- New `state/effect.slice.ts` (avoids growing `transform.slice.ts`, which is ratchet-capped): `warpSelection(kind, params)` and `stylizeSelection(op, params)` following the `transformSelection` bake pattern — remap selected objects' ink maps, produce a new doc, `syncDoc`, one undo step; square-grid gated like the rest of the selection bar.

## Phase 5 — Selection bar UI
- `selection-actions.component.tsx`: add a "More (•••)" `BarButton` (file stays small; overflow content goes to a new `selection-more-menu.component.tsx` built on the existing `FloatingPanel` pattern, grouped: Warp / Stylize / later Repeat).
- New `selection-warp-popover.component.tsx`: preset picker + sliders (amount, radius, center, wavelength, seed), live preview rendered through the existing selection-transform preview path (`use-selection-transform.hook.ts` previews drag transforms on the overlay canvas — the popover swaps the affine matrix for the warp field), Apply commits via Phase 4 actions. One-click buttons for outline/shadow/glow/invert/despeckle with sane defaults.
- Icons: inline 16×16 stroke SVGs per house style; i18n keys (`sel.more`, `warp.*`, `fx.*`) added to both `en.messages.ts` and `ru.messages.ts`.

## Phase 6 — Checks & delivery
- Full gate: `npm run format` → `lint` → `arch:check` → `knip` → `tsc --noEmit` → `npm test`; 0 errors required.
- Design-review skill checklist on the new UI (chip sizes 28px desktop / 44px mobile targets, tokens, z-index).
- Follow-up roadmap (not in this slice, each ~one field function + menu row later): remaining warp presets, booleans/align/z-order/skew, repeats bake (`mod.arrayCircle`/`arrayGrid`/path already exist), liquefy brush, envelope distort, despeckle & replace-color.
- Commit proposal (you commit): `feat(selection): warp presets, stylize effects and More menu on the selection bar` with body describing engine warp field, mod.warp node, bake actions, and the popover UI.