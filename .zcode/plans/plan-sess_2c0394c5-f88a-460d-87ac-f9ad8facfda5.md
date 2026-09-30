# Texture upgrades: figure-level gap + procedural patterns

## Context

Textures in Ditherlab are baked vector "flecks" — small path fragments punched out of a color's fill (evenodd), placed on a document-anchored lattice (`texture-region.ts`, `texture-core.ts`, `texture-field.ts`). Today's gap (`TextureSettings.gap`, 0..0.45 cell) is **per-cell**: `regionBounds` (texture-region.ts:123–129) insets each cell's open sides individually, so the clean band follows the stepped pixel grid and also bites at internal color boundaries. The metaball path already has outline-distance logic (`contourDepth`, texture-field.ts:89–95) to model the global mode on.

Scope: square grids only (as today). Everything stays baked vector geometry — no render-side changes for canvas/PNG/SVG.

## Feature 1 — Figure-level gap mode (core ask)

New field `gapMode: 'cell' | 'figure'` on `TextureSettings` (default `'cell'` → all existing docs/presets render identically).

**Semantics.** In `'figure'` mode the gap band is measured from the **outer silhouette of the whole figure** (all colors merged): a smooth Euclidean band around the merged shape's outline. Texture flows across internal color borders without seams; staircase diagonals get a smooth band instead of a stepped one. `'cell'` keeps today's behavior.

**Engine (region path).**
- `geometry-shape.ts`: when `tex.gapMode === 'figure'`, build once per `shapeGeometry` call a `FigureSpace` and pass it to each color's `regionTextureFragments(cells, t, key, fig?)` (new optional 4th param; style-previews builds it from its own cells):
  - occupancy index: `Int32Array`/`Map` keyed by grid cell → that cell's `TextureCell` (grid cells hold exactly one color), for "probe point is inside content" tests including corner-fillet carve (reuse `cornerPointOk` logic);
  - boundary segments: for every cell side with `connectedX === false`, a unit segment in doc units, bucketed in a spatial hash (bucket size ≥ `gapU`, so 3×3 neighborhood queries are exact). Rounded corners are treated as square for distance — slightly conservative near fillets, acceptable.
- `texture-region.ts` `sampleOk`/`fits`: in figure mode each of the 9 probe points must (a) land inside content (any color, fillet-aware) and (b) be ≥ `gapU` from the nearest boundary segment. Early-out keeps the `'cell'` path byte-identical.
- `outline.ts` (stroke region): same mechanism with its own cells.
- Metaball/field path: already outline-based via `contourDepth` — no change.

## Feature 2 — New procedural distributions

New `TextureDist` values, each a small pure case in `distWeight` (texture-core.ts) — split into per-pattern helpers to stay under the function-size limits. Reuse `valueNoise`/`hash2`; frequency derives from the existing `scale` knob, orientation from existing `angle` (no new knobs):

| id | look |
|---|---|
| `waves` | concentric rings from figure center (ripple) |
| `sunburst` | angular rays from center (ray count from `scale`) |
| `spiral` | spiral arms (angle + radius phase) |
| `honeycomb` | hex-lattice edge bands |
| `scales` | fish-scale arcs (offset half-drop rows) |
| `weave` | alternating h/v dashes — knit/tweed |
| `checker` | hard ordered checkerboard |
| `fade` | linear density fade along `angle` across the figure |
| `bayer` | ordered dithering: accept = `weight > bayer8[(x mod 8)][(y mod 8)]/64` over a smooth seeded noise field — authentic retro dither, matrix fixed (seed-independent, like halftone) |

## Feature 3 — Even scatter placement

New `TextureSettings.even: boolean` (default false). In the region path's accept step, accepted fleck centers go into a pitch-sized spatial hash; new candidates within `0.9 × pitch` of an accepted center are rejected (Poisson-disk style dart throwing, deterministic since lattice scan order is fixed). Applies to grain/grunge; hidden for halftone.

## Feature 4 — New fleck silhouettes

New `TextureShape` values, each one case in `emitFleck` (texture-core.ts), drawn in the unit bbox so the existing 9-point `fits()` probes stay conservative: `triangle`, `diamond` (inscribed), `cross` (plus), `star` (5-point), `hex`, `ring` (outer+inner subpath — evenodd leaves an ink dot inside the hole), `dash` (rounded 2.5:1 bar rotated to `angle`). Reuse `starPoly`-style generators from cell-shape-geom.ts where they fit.

## Cross-cutting sync points (per new field/value)

- `doc.ts`: union types + `TextureSettings` fields + `defaultDoc()` defaults.
- `doc-style.ts` `textureEqual`; `geometry-elements.ts:62–79` style cache key.
- `project-parse.ts` `deserializeTexture` + mirror unions (~lines 26–28); `presets.ts` mirror lists (~47–49) + `normalizePresetConfig` + `configMatchesState`.
- i18n `en.messages.ts` + `ru.messages.ts`: `texture.gapMode(.cell|.figure)(.desc)`, `texture.even(.desc)`, `texture.dist.<new>(.desc)`, `texture.shape.<new>(.desc)`.
- UI `texture-section.component.tsx`: extend the dist/shape chip arrays; inline two-chip "Pixel / Figure" toggle directly above the gap slider (same visibility as the slider); `CheckRow` "Even spacing" for grain/grunge. If the section outgrows its size ratchet, split the option arrays into a sibling data module.
- 2–4 built-in texture presets showcasing the new modes (e.g. a bayer-dither poster, a sunburst fade, a scaled ring texture) in `preset-lists-textures.ts`.

## Tests & verification

- `texture.test.ts`: figure-gap semantics (merged multi-color figure: band hugs outer silhouette, texture persists across internal color borders, `'cell'` unchanged — existing tests must pass untouched); new dists deterministic + gap-respecting; `bayer` seed-independence; `even` minimum pairwise spacing; legacy project JSON without new fields → defaults.
- `presets.test.ts` round-trip for new values; mirror-list consistency.
- Feedback loop until green: `npm run format:check`, `lint`, `arch:check`, `knip`, `npx tsc --noEmit`, `npm test`; design-review checklist for the panel change. `npm run bench` + PERFLOG line only if texture benches move (default `'cell'` path is untouched, so no regression expected).

## Notes

- The working tree has uncommitted cell-shape WIP overlapping `geometry-shape.ts` and both i18n files — I'll build on top of it without touching its semantics; recommend committing that work first (I'll propose the commit text; per convention you run `git commit`).
- Suggested commits (proposed, you commit): `feat(texture): figure-level gap mode`, `feat(texture): procedural pattern distributions and ordered dither`, `feat(texture): even scatter placement and new fleck shapes`.

## Parked ideas (not this iteration)

Crack/crackled-earth pattern (Worley edges), contour-following "stitch" flecks along the outline, moiré/interference field, blue-noise quality placement, textures on hex/triangle grids.