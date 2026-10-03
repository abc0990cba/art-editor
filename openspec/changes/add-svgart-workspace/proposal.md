# Proposal: add-svgart-workspace

## Why

The gradient workspace traces raster renders into AI-safe SVG, but authoring such art by hand
still happens outside the app (the gen3.py scripts behind star_v3.svg). A fourth project kind
gives the editor a native authoring surface: vector figures with stacks of SVG gradient paints,
canvas gradient handles and light-driven face generation. Hard product constraint: the exported
SVG consists only of the subset Adobe Illustrator opens as live vectors — softness comes from
`stop-opacity` falloffs, never from filters or blend modes.

## What Changes

- **Engine** (`src/engine/svgart/`): an authored scene model (shapes with stacked paints and
  arbitrary stops), OKLab stop ramps, parametric figures (star/polygon/ellipse/rect/blob),
  hit-test math, an AI-safe serializer (baked `userSpaceOnUse` coordinates — `gradientTransform`
  is never emitted, `clipPath`, elliptical radials via group transforms), soft-layer generators
  (soft shadow / glow / highlight as radial falloffs), light-driven templates (star, sphere,
  aurora) whose output is ordinary editable layers, and a per-effect Illustrator compatibility
  table.
- **Fourth project kind** `kind: 'svgart'`: storage union + upgrade-on-read branch (no IDB
  migration), its own zustand slice outside undo history (mirroring the gradient slice,
  throttled autosave), and a workspace: live SVG stage with selection and canvas gradient
  handles (linear axis, radial center/radius/focus), layer list, fill-stack editor with a stops
  bar, shape parameter editors, a soft-layer panel with AI compatibility badges, and SVG
  code/copy/download. No worker needed — serialization is cheap.
- **App chrome** follows the kind: route surface, top-bar branches, creation dialog card with a
  template picker, library card badge and live SVG thumbnail, i18n (en/ru).
- **AI-compat spike**: `samples/ai-import-test-svgart.svg` plus a studio section in
  `docs/research/ai-import.md` — manual verification of the studio-specific constructs in
  Illustrator (radial `fx/fy`, elliptical falloff via `<g transform>`).
- Closes the deferred manual-handles item (6.1) of `add-gradient-workspace` for the new
  workspace.

## Impact

- Affected specs: `project-library` (fourth kind), new capability `svg-studio`.
- No IDB version bump; upgrade-on-read handles the new kind (records are self-sufficient).
- Engine stays pure (dependency-cruiser rules untouched); the feature never imports other
  features; the pixel `Doc` is untouched.

## Out of scope (later changes)

- SVG import/parsing.
- SVG filters and blend modes — return only if the studio spike sheet proves they survive
  Illustrator import as live vectors; until then the studio does not offer them.
- A non-AI-safe "full browser" export profile; mesh/conic; undo for the studio; animation;
  raster-to-gradient tracing (belongs to the gradient workspace); DiffVG refinement.
