# Proposal: add-halftone-screen-engine

## Why

Vector halftone output was the app's strongest "vector effect" but capped: texture
halftone always rendered dots on a rotated grid (documented gap), the fill tool's
screen pattern had no lattice choice, the node graph had no halftone operation, and
import had no print-screen or CMYK separation entry point despite the pixel plumbing
for all of these existing.

## What Changes

- **`src/engine/screen-engine.ts`** — one pure core: a lattice generator (grid / hex /
  rings / sunburst / spiral / phyllotaxis / scatter, deterministic, point-capped), mark
  silhouettes reused from the cell-form registry (10 marks), tone mappings size /
  density / twist, a spatial lattice index and cell-coverage tests.
- **Texture panel**: halftone honors the speck shape (stars, squares, rings… render as
  real evenodd vector marks — closing the "always dots" gap; the Halftone chip still
  enters on classic dots), and a new Lattice chip row places marks on hex rows,
  concentric rings, sunburst rays, an Archimedean spiral, phyllotaxis or a blue-noise
  stipple (`texture.htLattice`, engine `texture-lattices.ts`).
- **Fill tool**: the `screen` pattern gains a lattice choice — grid, hex (offset rows)
  and rings (polar screen around the anchor).
- **Node graph**: new `mod.halftone` re-renders any input raster as a screen of marks
  (lattice × mark × mode × pitch, fixed ink or source colors) — the first tone-aware
  node, powered by a new `EvalContext.luma` palette-luminance service (the sanctioned
  context-service extension point).
- **Import**: three print-flavored dithers — `screen-45` (rotated dot screen),
  `screen-wave` (wavy line screen) and `cmyk` (four rosette screens of process inks at
  15°/75°/0°/45° overprinted subtractively, snapped to the palette).

## Capabilities

### Modified

- `pixel-styling`: texture halftone marks and lattices.
- `import-image`: three new algorithms in the ordered and special families.
- Node graph: the halftone mod and the luma context service.

## Non-Goals

- Engraving flow lines, TSP single-line art and weighted Lloyd stippling relaxation
  (follow-up; the lattice/mark registries leave room for them).
- Video/animation/temporal effects (unchanged).
