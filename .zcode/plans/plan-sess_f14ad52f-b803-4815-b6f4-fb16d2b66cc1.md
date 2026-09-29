# Cell shapes ("forms") for pixel rendering — implementation plan

## Concept

The app already separates three orthogonal axes: **where ink goes** (glyphs, fill patterns), **what color it is** (palette), and **how ink is drawn** (`PixelStyle` + renderMode + texture). Cell shape joins the third axis as a new `PixelStyle` field. Because every renderer (live canvas, PNG, SVG export, thumbnails, node previews) consumes the single `buildGeometry(doc)` → SVG-path-strings pipeline, implementing the shape once in the geometry engine makes every surface match automatically — no duplicated drawing code, per-element style freezing, selection-aware editing, presets and project persistence come for free.

New engine module `src/engine/cell-shapes.ts` — a pure registry of shape definitions; nothing else in the engine needs to know individual shapes exist. Adding form #13 later = one registry entry + 2 i18n keys.

## Shape catalog (12) + shared params

`PixelStyle` gains:
```ts
shape: CellShapeId            // default 'square'
shapeParams: ShapeParams      // { thickness: 0.25, points: 5, rotation: 0 } defaults
```
- `thickness` (0.05..0.5) — ring wall, cross/x-cross arm width, star inner radius
- `points` (3..12) — star point count
- `rotation` (0..360°) — applies to every shape (rotated squares, tilted triangles…)

Catalog: `square` (default, unchanged fast path), `circle`, `ring`, `triangle`, `triangleDown`, `diamond`, `cross`, `xCross`, `star`, `sparkle` (4-point), `hexagon`, `heart`. Polygonal shapes (triangle/diamond/cross/xCross/star/sparkle/hexagon) are point lists rendered through the existing `roundedPolygonPath` (moved from grid-geometry to a shared spot) so the existing `radius` knob composes — rounded stars, chamfered hexagons. Curved shapes (circle/ring/heart) ignore `radius`; UI dims the corner controls for them. `sizeX/Y` scaling works for all shapes (already computed before fragment emission).

## Steps

**0. WIP baseline** — the uncommitted work (glyph-generators-art, demo-project/demo-seed, i18n) stays untouched by the geometry changes; propose a commit message for it first so diffs stay separable (you commit, per AGENTS.md).

**1. Engine: `cell-shapes.ts` + `cell-shapes.test.ts`**
- `CellShapeId`, `ShapeParams`, `CellShapeDef { id, params: ('thickness'|'points'|'rotation')[], poly? | path? }`, `cellShapeFragment(id, x, y, w, h, params, radiusFractions...)` returning an SVG path fragment (ring = two subpaths; existing `evenodd` fill rule handles the hole).
- `shapePreviewPath(id, box)` — normalized path for UI icons (pure string, no React; settings-panel builds the SVG).
- Tests: every shape emits a closed, non-empty path inside the cell bbox; ring has a hole; rotation 360° ≡ 0°; param clamping; square delegates byte-identical output to today's `roundedRectPath`.

**2. Model wiring**
- `doc.ts`: fields + defaults in `defaultDoc()` (doc.ts is ratcheted — bump its cap in `.oxlintrc.jsonc` by the added delta, noted in the commit body).
- `doc-style.ts` `samePixelStyle` + `geometry-elements.ts` `elementStyleKey`: include shape+params so element-scope restyles regroup.
- `project-json.ts` / `project-parse.ts`: serialize; `normalizeStyle` backfills `shape:'square'` + default params for legacy projects (old docs load unchanged).
- `preset-configs.ts` / `presets.ts`: carried inside `style` — verify `normalizePresetConfig` round-trips the new keys.

**3. Geometry**
- `geometry-shape.ts`: `runMerge` fast path additionally requires `shape === 'square' && rotation === 0`; per-cell branch dispatches to `cellShapeFragment`. V1 guard: baked texture holes stay square-only (`textured && shape === 'square'`) — evenodd holes falling outside a round shape would paint floating specks; silhouette-clipped texture is a documented follow-up.
- `geometry.ts` `stagingPreview`: same dispatch at its fragment site; `usable()` gate unchanged → in-stroke fast preview keeps working with shapes.
- Shape applies to `pixels` render mode (outline/metaball unaffected, noted in UI desc).
- Tests: buildGeometry per shape, stagingPreview parity with shapeGeometry, runMerge disabled for non-square/rotated, texture guard, project-parse legacy round-trip.

**4. State + UI**
- `style.slice.patchStyle` already flows new PixelStyle keys to the canvas — verify only.
- settings-panel: new `shape-picker.component.tsx` — tile grid of 12 SVG icons (from `shapePreviewPath`), `role="listbox"` + `aria-selected`, Tooltips, 28px chips / 44px mobile per design conventions; mounted in `style-section` next to size/radius via the shared `StyleTarget`. Conditional sliders below it: rotation (all), thickness (ring/cross/xCross/star), points (star). Radius/cornerStyle/squareEdges controls dim when a curved shape is active. Previews in `style-previews.component.tsx` (renders via `buildGeometry`, nearly free).
- i18n: `style.shape` (+`.desc`), `shape.<id>` ×12, `style.shapeRotation/Thickness/Points` (+`.desc`) in **both** en and ru messages.

**5. Presets — new builtin group "Forms"**
- `preset-lists-forms.ts` following the existing `preset-lists-*.ts` pattern: e.g. Окружности, Кольца, Кресты, Звёздное поле, Мозаика (hex), Сердечки — each pins shape + params + complementary size/radius; they appear in the Presets dialog automatically; matching via `configMatchesState` verified.

**6. Glyphs (small, satisfies "more glyphs")**
- Keep the WIP art generators/ornament family as-is; add one shape ramp missing from the set: `glyphSetTriangles` (triangle grows with tone) in `glyph-generators-art.ts` + test + builtin registration under the existing family — the established 6-step generator checklist, no new architecture.

**7. Bench + PERFLOG**
- Add a `geometry` bench scenario for a non-square shape (circle, star); `npm run bench` before/after; PERFLOG line: default docs unaffected (square fast path intact), non-square shapes cost the same class as the existing radius≠0 per-cell path.

**8. Gate**
- Full loop green: `format:check → lint → arch:check → knip → tsc → test`; design-review skill pass on the settings-panel change; propose conventional-commit texts per group (feat(engine), feat(settings-panel), feat(presets), test/bench) — you run the commits.

## Out of scope (follow-ups)
Texture holes clipped to shape silhouettes; shapes in outline/metaball modes; glyph+palette bundles inside presets; per-shape sprite caching for perf.
