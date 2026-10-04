# Tasks: add-svgart-workspace

## 1. Openspec and AI-compat spike

- [x] 1.1 This change folder: proposal, tasks, `svg-studio` delta, `project-library` delta
- [x] 1.2 `samples/ai-import-test-svgart.svg`: studio construct matrix for manual AI check
- [x] 1.3 `docs/research/ai-import.md`: studio sheet section (table + policy notes)

## 2. Engine (src/engine/svgart/)

- [x] 2.1 `types.ts` scene/shape/paint model; `oklab.ts` + `paint.ts` (sRGB/OKLab ramps, hex
      baking, pad semantics) — tests
- [x] 2.2 `figures.ts` parametric contours (rect/ellipse/polygon/star/blob → path d) — tests
- [x] 2.3 `hit.ts` point-in-shape and handle hit zones — tests
- [x] 2.4 `serialize.ts` AI-safe SVG (defs, clipPath, baked coordinates, group-transform
      elliptical radials) + golden file — tests
- [x] 2.5 `softlayers.ts` soft shadow/glow/highlight generators; `compat.ts` AI status table
- [x] 2.6 `light.ts` + `templates.ts` star/sphere/aurora generators — structure tests
- [x] 2.7 `normalize.ts` + `index.ts` facade

## 3. Storage and state

- [x] 3.1 `projects.ts`: `kind: 'svgart'` union member, upgrade-on-read branch, `newSvgArtEntry`
- [x] 3.2 `state/svgart.slice.ts`: scene + selection + actions, throttled autosave into the
      bound entry, `loadSvgArtEntry`
- [x] 3.3 Store composition and `State` surface

## 4. App chrome

- [x] 4.1 Route surface: `SvgArtSurface` in `project-route`, imports/pastes route by kind
- [x] 4.2 Top bar kind gates
- [x] 4.3 New-project dialog: fourth kind card + template picker
- [x] 4.4 Library card: svgart badge + live SVG thumbnail
- [x] 4.5 i18n keys (en + ru)

## 5. Feature workspace (src/features/svgart/)

- [x] 5.1 Workspace shell: stage + own right aside + mobile sheet + toolbar
- [x] 5.2 Stage: live inline SVG, selection overlay, handles (move/rotate; linear axis;
      radial center/radius/focus)
- [x] 5.3 Layers panel: reorder, visibility, opacity
- [x] 5.4 Fill-stack editor: solid/linear/radial, stops bar (offset/color/alpha), order
- [x] 5.5 Shape params panel; soft-layer panel with AI badges
- [x] 5.6 Code panel: serialize, copy, download

## 6. Polish

- [ ] 6.1 Empty states, mobile 44px targets, design-review pass
- [x] 6.2 `docs/architecture/engine-map.md` row + `docs/modules/svgart.md`

## 8. Rich editing pass (follow-up, same capability)

- [x] 8.1 Engine: `scaleLayer`/`flipShape`/`alignLayer`/`rotatedCopies`/`mirroredCopy`, ring shape
      (`fill-rule="evenodd"`), stop ops (`reverseStops`/`evenStops`/`rampFromColors`) — tests
- [x] 8.2 Quick actions per layer (duplicate, flips, center, front/back, radial repeat ×4/6/8/12,
      mirrored copy), editable X/Y + scale slider, canvas scale knob
- [x] 8.3 Fill stack reorder/duplicate, stop reverse/distribute, 6 palette ramps
- [x] 8.4 Scene background editor (none/solid/linear/radial); N-gon + ring factories
- [x] 8.5 Studio hotkeys: arrows nudge (Shift ×10), Delete, Cmd/Ctrl+D duplicate, Escape deselect

## 9. Rich editing pass 2 (follow-up, same capability)

- [x] 9.1 Undo/redo for the studio (scene rides the shared temporal history; toolbar chips + ⌘Z)
- [x] 9.2 Multi-selection: Shift-click, rubber-band marquee, group move/nudge/duplicate/delete,
      group flips/align/z-order; per-layer quick actions stay available
- [x] 9.3 Smart snap guides (canvas center + other layers' bbox edges/centers) during group moves
- [x] 9.4 Gradient stops as on-canvas handles (drag projects onto the paint axis)
- [x] 9.5 Blend modes per layer with two export profiles: AI-safe (default, drops blends) and
      Browser (mix-blend-mode + isolation); profile toggle with a dropped-blends warning
- [x] 9.6 Stop grain: `jitterStops` bakes OKLab noise into stops (banding killer, AI-safe)
- [x] 9.7 Templates: isometric cube and cylinder (light-shaded faces)

## 7. Deferred (follow-up changes)

- [ ] 7.1 SVG import/parsing (edit studio-authored or gen3-style files in-app)
- [ ] 7.2 Filters / blend modes — only if the spike sheet proves AI keeps them live
- [ ] 7.3 Non-AI-safe "full browser" export profile
- [ ] 7.4 Undo history for the studio; raster-to-gradient tracing stays in the gradient
      workspace
