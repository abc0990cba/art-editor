# Ditherlab (Glyph Editor)

A minimalist pixel web editor with clean vector SVG export.

A cell grid up to **4096×4096**, pixels as configurable shapes (per-corner rounding,
independent X/Y stretch), a **metaball** mode ("liquid" merging of neighboring cells), a full
symmetry suite, connectors between cells and sub-cells. Three project kinds share one shell:
**pixel** documents, plus raster→vector workspaces — **vector** (image tracing) and
**gradient** (fitted SVG gradients). Canvas preview and SVG export are built by one geometry
engine — the vector is exactly what you see on screen.

## Running

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm test           # vitest — engine unit tests
npm run lint       # oxlint (0 errors — the gate; warnings advisory)
npm run lint:ai    # oxlint in agent format (machine feedback loop)
npm run arch:check # layer/feature boundaries (dependency-cruiser)
npm run knip       # dead exports/files/dependencies
npm run format     # oxfmt — strict formatting (AI-code validator)
npm run format:check
npm run build      # tsc --noEmit + vite build
npm run bench      # engine benches → bench/results/engine-bench.json
```

Conventions and layer boundaries: [AGENTS.md](AGENTS.md).

## Features

- **Canvas** — W×H from 1 to 4096, wheel zoom, panning (space / middle button), fit, grid,
  checkerboard or solid background. Size presets by popular ratios — 1:1, 4:3, 3:2, 16:9,
  21:9, 2:1, Game Boy (10:9), NES (8:7); each size has an even and an odd variant — an odd
  grid has a central row/column to anchor symmetry axes.
- **Tools** — one flat list in the left rail: pencil `B`, eraser `E`, fill `G`, picker `I`,
  line `L`, rectangle `R`, ellipse `O`, connector `C` (two clicks — a rounded route between
  cell centers), star `S`, polygon `N`, diamond `D`, heart `H`, spiral `Q`, arrow `A`,
  lightning `K`, moon `M`, wave `W`, cross `X`, flower `J`, gear `U`, sun `4`, bento `5`,
  ring `T`, arc `Y`, drop `P`, chevron `1`, concentric `2`/`3`, zigzag `Z`, selection `V`.
  Double-click a tool opens its settings (star rays, gear teeth, spiral turns, arrowhead,
  wave periods — each tool has its own parameters).
- **Pattern fill** — the fill tool mixes the active and a second color across 22 patterns:
  Bayer 2×2–16×16, cluster dot and halftone screen, blue noise and void-and-cluster, noise
  and gradient-interleaved noise (IGN), block checker, grid, crosshatch, stripes, zigzag,
  dots, bricks, concentric rings around the click, and glyph tiles. Scalable patterns get a
  tile-scale slider, noisy ones a grain size. Color transitions are even (density slider) or
  gradient (vertical/horizontal/diagonal/radial from the click) — classic pixel-art
  dither gradients.
- **Image import** — photos become pixels: placement (fill/fit/stretch/resize canvas),
  brightness/contrast/saturation and preprocessing (blur, sharpen, hue rotate, denoise,
  smoothing). Dithering — 23 algorithms in three groups: ordered (Bayer 2–16, cluster dot,
  halftone, blue noise, void-and-cluster, pattern, crosshatch), error diffusion
  (Floyd–Steinberg, Atkinson, Sierra, Sierra-Lite, Stucki, Burkes, JJN, Stevenson–Arce,
  Nakano) and special (Ostromoukhov, variable-error, dot diffusion, Riemersma) — serpentine
  scan, strength and threshold sliders. Post: glow (screen-blend bloom), chromatic
  aberration, denoise and smoothing — all settled back into the palette. Palette: document,
  auto (median-cut from the photo) or any of 22 built-ins — from PICO-8 and C64 to NES,
  ZX Spectrum, CGA Mode 4, Macintosh, Teletext and Gruvbox; palette blending inserts ramp
  midpoints for smoother dithers. One-click presets: Game Boy, Pocket, Macintosh, Newspaper,
  Halftone, NES, ZX Spectrum, Vaporwave, Teletext, Gruvbox. Palettes import/export as
  `.hex`/`.gpl`/PNG (including a swatch-strip image). The import result is ordinary editor
  geometry, so SVG export works immediately.
- **Pixel styling** — presets (square/rounded/circle) and 28 cell forms (circle, heart,
  cross, star, gear, …), radius 0–50%, advanced per-corner rounding (4 sliders), independent
  X/Y stretch, tone-driven sizing.
- **Metaball** — opt-in "liquid" merging of cells: strength 0–100, per-color isolation,
  field quality (low/medium/high).
- **Render modes** — Pixels / Outline (connected cells form one silhouette with rounded
  outer corners) / Metaball; for Outline and Metaball — diagonal-cell connection modes:
  sides only, through-corner (pinch) or through-corner with a bridge overlay.
- **Element styles** — a "style applies: per element / whole canvas" toggle. In element mode
  every stroke, shape, fill and connector freezes a snapshot of all styles at draw time;
  later setting changes affect only new strokes. Neighboring strokes with equal styles render
  as one group (metaball blobs fuse). The selection tool (`V`) picks a drawn element: restyle
  it in the same panels, move it, duplicate or delete it.
- **Symmetry** — vertical, horizontal, 4-way, diagonal 8-way, radial N-way (2–24),
  kaleidoscope (N-fold + mirror); guide axes/spokes; applies to all drawing tools.
- **Sub-cells** — ×1/×2/×3: draw "half-pixels" inside a cell (connectors stay cell-level).
- **Node graphs** — any object can become a **living recipe**: a chain of source → modifier →
  ramp → style nodes (Blender-style card editor) re-evaluated on every edit; 19 operations,
  preset recipes, JSON import/export and a machine-readable node registry for AI agents.
- **Vector & gradient workspaces** — import a raster and get a clean SVG: outline/spline
  tracing (the vtracer V1 pipeline, ported to TypeScript) or fitted `linearGradient`/
  `radialGradient` paints; presets, live preview with an original-vs-result divider (and a
  ΔE heatmap for gradients), SVG export. Heavy math runs in a Web Worker.
- **Glyph tiles** — user-editable tone-ramp tile sets (Bayer-derived, drawn, or generated)
  used as dither fields by the fill tool and image import; a tile editor with a photo
  preview.
- **Projects** — a home screen gallery with typed cards (pixel/vector/gradient), a Continue
  card, 24 built-in demo projects, and ambient autosave into IndexedDB (debounced ~2 s,
  instant localStorage mirror for small docs, thumbnails at most every 30 s).
- **Export** — SVG (vector paths, same engine as the preview; with or without background),
  PNG 1×–16× (side cap 5000 px), project save/load as JSON, plus a "Vectorize" handoff from
  a pixel project into a new vector project.
- **Misc** — undo/redo (`Ctrl+Z` / `Ctrl+Shift+Z`), UI in English and Russian, `Esc` cancels
  the pending connector/transform.

## Architecture

```
src/
├── app/       # shell: router, top bar, workspace, bench harness
├── features/  # vertical UI modules: canvas, tools, nodes-editor, layers,
│              # settings-panel, glyph-editor, projects, export, import,
│              # vectorizer, gradient
├── engine/    # pure TS, no React: document model, scene tree, geometry
│              # (shapes, outline, metaball), grids, symmetry, brush, texture,
│              # dithering, node graphs, tracing, SVG/PNG, project JSON
├── state/     # zustand store + zundo (undo/redo), 16 slices, autosave effects
├── storage/   # IndexedDB persistence (projects, presets, brushes, glyph tiles)
└── shared/    # ui/ (primitives + vendored shadcn), lib/, i18n/
```

Key principle: `buildGeometry(doc) → StyledPath[]` — the single source of truth. The canvas
renderer paints these paths through `Path2D`, the SVG exporter serializes the same paths, so
preview and vector are always identical (including metaball mode — contours are extracted
with marching squares from the scalar field, not SVG filters).

## Documentation

- [docs/README.md](docs/README.md) — the technical documentation index: architecture,
  decision records (ADRs, incl. the Rust/WASM policy), per-module technical docs, research.
- [AGENTS.md](AGENTS.md) — engineering conventions (check chain, naming, size ratchets).
- [bench/PERFLOG.md](bench/PERFLOG.md) — the performance change log.

## Specifications

The project is developed via [OpenSpec](https://github.com/Fission-AI/OpenSpec): requirements
and scenarios live in `openspec/specs/`, change history in `openspec/changes/` (the initial
change: `add-editor-core`). OpenSpec owns *behavior*; `docs/` owns *how it works and why* —
the boundary is defined in [docs/decisions/0007](docs/decisions/0007-openspec-docs-boundary.md).
