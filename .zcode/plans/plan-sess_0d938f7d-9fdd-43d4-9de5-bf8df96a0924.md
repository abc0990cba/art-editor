# Add 13 showcase example projects to the «Примеры» gallery

Goal: grow the built-in examples from 7 to 20, with each new one high-level, artistic, and deliberately exercising features no current demo uses — hex/triangle/radial grids, metaball/outline rendering, cell shapes, per-element styles, node graphs, connectors — plus the requested bright many-color pieces, abstracts, portraits, figures, and a banknote.

## New examples (all deterministic, sparse-ink, ≤192 wide so lazy thumbnails stay fast)

| # | id / file (`src/engine/demo-*.ts`) | Art concept | Features showcased |
|---|---|---|---|
| 1 | `demo.tone` — Tone Sun · 96 | Halftone-style rising sun: circle cells sized by darkness form a smooth radial ramp | `toneSize` + `toneSizeMin`, `style.shape:'circle'`, duotone |
| 2 | `demo.hexreef` — Hex Reef · 96×80 | Top-view mosaic turtle (shell dome, flippers, head) in coral/teal/amber, dithered water | **hex grid**, ~10 colors, Bayer dither on hexes |
| 3 | `demo.lava` — Lava Lamp · 96×128 | Neon blob clusters in 4 colors on near-black, fused into liquid shapes | **renderMode metaball**, metaball strength/perColor |
| 4 | `demo.kaleido` — Kaleido Bloom · 128 | 12-fold kaleidoscope with spiral twist, neon bands on dark | 12-fold rotational symmetry + twist, many colors |
| 5 | `demo.mandala2`→`demo.galaxy` — Radial Galaxy · 128 | Spiral galaxy: log-spiral arms of stars, glowing core, deep-space gradient | **radial grid + `radialEven:true`**, star dither |
| 6 | `demo.cubist` — Cubist Portrait · 128 | Faceted cubist face (asymmetric planes, geometric eyes), 12–14 bold colors | **triangle grid**, abstract portrait, big palette |
| 7 | `demo.tripeaks` — Triangle Peaks · 128×96 | Low-poly sunset mountain range: sky gradient, sun, 3 noise ridges | **triangle grid** (flat facet sampling), 12+ colors |
| 8 | `demo.confetti` — Confetti · 128 | Celebration burst: separate objects drawn as circles / 5-point stars / hearts / diamonds | `styleScope:'element'`, cell-shape family + `shapeParams` |
| 9 | `demo.neoncity` — Neon City · 128×96 | Night skyline, dithered lit windows, rounded joined silhouettes | **renderMode outline**, convex/concave radius |
| 10 | `demo.wallpaper` — Suzani Tile · 128 | Seamless ornamental suzani pattern (flowers/vines), terracotta-indigo-gold | wallpaper-style repeat baked via mirrored sector painting, pattern dither |
| 11 | `demo.nodegarden` — Node Garden · 128 | 3–4 arranged objects each driven by a **node graph** (flower via arrayCircle, snowflake diag8, crown, metaball blobs) | per-object `graph` (sources/mods/repeats/ramp/style nodes), `GRAPH_PRESETS` + `fitGraphToCanvas` |
| 12 | `demo.constellation` — Constellation · 128×96 | Night-sky gradient with sparkle-cell stars joined into constellation figures | **links/connectors** (`obj.links`, `connectorWidth`), sparkle shape, `doc.bg` |
| 13 | `demo.dollar` — Banknote · 192×96 | Stylized green-engraving banknote: ornate frame + corner rosettes, guilloche rings, hatched oval portrait silhouette, big bitmap "100", lathe-work line field | fine engraving dither (bayer + line screens), multi-layer composition, 192×96 |

Each new file follows the `demo-mandala.ts` pattern: pure math over `demo-kit` ink grids (`paint`/`fillRect`/`stampBitmap`/`screenValue`/`hash01`/`noise1D`), `makeLayer`/`makeObj`/`sceneHead`, Russian layer/object names inside the doc (existing convention), localized display labels via i18n.

## Changes to existing files

- **`src/engine/demo-kit.ts`** — extend `DemoObjJSON` with optional `graph?: Graph`; give `makeObj` an optional opts param `{ style?, links?, graph? }` (defaults unchanged: frozen `STYLE`, `[]`). Optionally add a tiny helper to paint per-cell-by-index for radial grids (`paintIdx`).
- **`src/engine/demo-project.ts`** — register 13 new defs; order: existing pixel demos → new ones (small→large) → vector/gradient last.
- **`src/shared/i18n/en.messages.ts` / `ru.messages.ts`** — 13 new `examples.<name>` labels each (e.g. `'examples.dollar': 'Banknote · 192×96'` / `'Банкнота · 192×96'`).
- **`src/engine/demo-project.test.ts`** — replace the brittle positional size assertion `[32,64,128,512]` with an expected-size-per-id map; extend the determinism check to loop every pixel demo (not just the poster). The existing all-demos deserialization/palette-bounds test automatically guards the new docs.

No UI code changes — `examples-section.component.tsx` renders the registry and resolves labels dynamically (7-column grid wraps to 3 rows for 20 items).

## Verification

Full loop until green: `npm run format:check` → `npm run lint` (respecting ratchet caps — every new file stays well under global limits) → `npm run arch:check` → `npm run knip` → `npx tsc --noEmit` → `npm test`. Then eyeball the gallery at `npm run dev` (thumbnails, labels EN/RU) and spot-open 3–4 docs (galaxy, node garden, banknote, confetti) to confirm they deserialize and render with the intended grid/style.

Proposed commit (you run it): `feat(examples): 13 showcase demos — hex/triangle/radial grids, metaball, outline, node graphs, banknote`