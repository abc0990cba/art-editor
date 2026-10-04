# Pixel stylization pack — metaball super-pixels, new render modes, pixel-op FX, 2 new lattices

Goal: give the pixel workspace a batch of new pixel-art/net tools. Everything existing keeps working — all new settings default to current behavior (`unit: 'cell'`, `fuseAll: false`, modes unchanged).

Key insight from exploration: the metaball field builder (`src/engine/geometry/metaball-field.ts`) splats every painted cell with the same global kernel radius — a 5×5 painted block is 25 identical tiny kernels. Per-source radius multipliers + block snapping give real "super-pixel" blobs that merge with 1×1 pixels.

## Part A — Metaball super-pixel blocks + global fuse (the core ask)

1. **Settings** (`src/engine/core/doc.ts` `MetaballSettings`): add `unit: 'cell' | 'block'` (default `'cell'`), `blockSize: 2..8` (default 3), `fuseAll: boolean` (default false). Wire through `project-parse.ts` normalize, `project-json.ts`, preset clamps (`presets/configs.ts`), `elementStyleKey` (`geometry/elements.ts`) + `sameMetaball` (`doc-style.ts`).
2. **Per-source radius**: `MetaballSource` gains optional `r` multiplier; `buildMetaballField` splat uses per-source `R = kernelRadius(strength, sub) * r` (metaball-field.ts).
3. **Block units** (`geometry/metaball.ts` `collectSquareSources`): when `unit === 'block'` (square grid only), snap painted cells to `blockSize`-aligned blocks; per painted block emit ONE kernel at block center with `r ≈ blockSize/2 + 0.5` (tuned via tests), plus capsules between edge-adjacent same-value blocks so neighbors bridge into smooth sausages. Corner-junction kernels stay cell-mode only. Result: a 5×5 block acts as one big blob that merges with 1×1 blobs and other 5×5 blocks. Non-square grids keep cell kernels (UI disables the block chips).
4. **`fuseAll`**: in `buildGeometry` dispatch (`geometry/index.ts`), when mode is metaball and `fuseAll`, bypass per-layer/element grouping and build one field set from the synced flat buffer — all strokes (even with different frozen styles) merge. Verify `doc.cells` is layer-synced (scene.ts `syncDoc`) at implementation time.
5. **UI** (`style-section.component.tsx` metaball block): unit chips Cell/Block, `blockSize` slider (visible when block, square only), `fuseAll` CheckRow. i18n en+ru.
6. **Tests**: block → one source per block with scaled radius; adjacency capsules; `fuseAll` fuses two differently-styled strokes into one path; defaults reproduce current geometry byte-for-byte.

## Part B — Two new render modes: `contour` + `extrude`

1. `RenderMode` += `'contour' | 'extrude'` (doc.ts) + `RENDER_MODES` (project-parse.ts) + `styles.node.ts` + dispatch in all three build sites (`geometry/index.ts`, `elements.ts`).
2. **Stroke support**: `StyledPath` gains optional `stroke`/`strokeWidth`; renderers updated: `output/svg.ts`, `output/png.ts`, canvas path painter.
3. **Contour** = stroke-only metaball: reuse field + `traceMetaballLoops`, emit stroked unfilled loops (net/bubble look). New knob `metaball.strokeWidth` (0.05..1). Square grid v1; non-square falls back to pixels.
4. **Extrude** (2.5D): per-cell RLE runs extruded along a chosen 8-way direction × depth into empty cells, emitted as flat fragment paths *before* the fill paths. New `ExtrudeSettings { depth 1..8, dir, color v }` on doc + ElementStyle + styleKey + restyle chain (same wiring as metaball).
5. **UI**: two chips in the Style render-mode row; extrude knob section (depth slider, 8-way direction chips, palette color row); contour stroke-width slider in the metaball block. i18n en+ru.
6. **Tests**: extrude emits shadow-only-in-empty cells behind ink; contour path carries stroke attrs; SVG output contains them.

## Part C — Pixel ops bundle (selection FX menu, destructive bakes)

New pure engine file `src/engine/effects/morpho.ts` over the `InkCell` map shape, plus `blockify`:

- `blockify(n)` — quantize selection to n×n snapped blocks; any painted cells → full block in the majority value (matches brush "pixel size" semantics). The headline net/super-pixel op.
- `dilate` / `erode` — 8-neighborhood grow/shrink, `steps` 1..4.
- `pixelPerfect` — canonical stair-L cleanup (removes jaggie corner pixels).
- `despeckle(minSize)` — remove connected components smaller than minSize (per value).
- `outlineOnly` — keep only boundary cells, drop interiors.
- `silhouette` — flatten all selected ink to one color.
- `longShadow` — 45°-style ray from ink along chosen direction to bounds/obstruction.
- `scanlines(period)` — darken every Nth row among ink cells.

Store: `effect.slice.ts` new `pixelOpSelection(op, params?)` reusing the existing `selectionInk`/bake plumbing and `isPlainSquare` guard. UI: `selection-fx-menu.component.tsx` gains grouped sections (Pixels / Shape / Light) with MenuTitle; small param popover (clone of warp-popover pattern) for blockify n, steps, despeckle size, period. i18n en+ru. Tests `morpho.test.ts` with exact pixel-pattern fixtures.

## Part D — New lattices: `rhombille` + `hexFlat`

1. `GridType` += both (`grids/index.ts`); `hexFlat` = extract orientation parameter from `makeHex` (pointy/flat swap); `makeRhombille` in `lattices.ts` as a compound lattice (octasquare pattern): 3 rhombi per hex center, `count = 3 × hexCount`, `cellAt` = hex hit + 120° sector by angle. `attachEdgeMap` derives neighbors generically; rotation works via `rotatedGrid`.
2. Wire: `docSize`, `cellCoordLabel`, `gridConvertMap` entries, project-dialog grid select, i18n grid names. Generic polygon rendering + `gridMetaball` work automatically.
3. Tests: `cellAt(center(i)) === i` roundtrips, neighbor symmetry, square↔rhombille conversion.

## Part E — Specs, docs, gate, commit

- openspec change folder with spec deltas (metaball-rendering, selection-effects, grid-types) + tasks; update `docs/modules/grids.md` / `engine-map.md` for new lattices.
- Full gate after each part: `npm run format:check`, `lint`, `arch:check`, `knip`, `npx tsc --noEmit`, `npm test`; design-review skill over the UI changes; manual smoke via `npm run dev` (brush px=5 + unit=block metaball).
- Constraints honored throughout: ≤400-line files, kebab-case naming, engine purity, `import type`, knip-clean exports, i18n both languages, `shared/ui` wrappers only.
- Propose Conventional Commit messages per part (you commit).

Suggested order: A → B → C → D → E.