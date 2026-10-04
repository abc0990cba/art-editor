# Proposal: add-pixel-stylization-pack

## Why

The pixel workspace's stylization vocabulary stops at three render modes (pixels / outline /
metaball), three selection stylize ops and nine warps. Metaballs treat every painted cell as an
identical tiny kernel, so a 5×5 brush pixel behaves like 25 small blobs instead of one
super-pixel unit that fuses with 1×1 pixels; there is no line-art or 2.5D render mode; and the
selection menu has no pixel-art morphology (block quantize, grow/shrink, stair cleanup). The
hexagonal mesh also exists in one orientation only, and the artistic rhombille (cube) tiling is
missing entirely.

## What Changes

- **Metaball super-pixels**: `MetaballSettings` gains `unit: 'cell' | 'block'` with a
  `blockSize` (2..8, square grid): every fully painted single-color aligned block collapses
  into one swollen kernel (per-source radius multiplier in the shared field builder) with
  capsules bridging edge-adjacent same-color blocks, while stray 1×1 pixels keep plain cell
  kernels. Incomplete or mixed blocks never collapse.
- **Metaball fuse-all**: a doc-level `fuseAll` toggle renders the whole document as ONE field
  set — per-layer isolation and frozen per-element styles are bypassed (square grid).
- **Contour render mode**: the metaball merge field traced as unfilled stroked loops
  (`metaball.strokeWidth`, 0.05..1 cell) — bubble-net line art. Square grid; `StyledPath`
  stroke support already existed in SVG/PNG output.
- **Extrude render mode**: classic 2.5D — every painted cell grows a flat body of
  `extrude.depth` (1..8) buffer cells along one 8-way direction into empty space, drawn before
  the fill in `extrude.color` (0 = darkest palette color). Rays stop at the canvas border and
  at painted cells. `ExtrudeSettings` freezes per element like every style block.
- **Selection pixel ops** (destructive one-click bakes, square grid): `blockify` (n×n majority
  quantize), `dilate` / `erode` (8-neighborhood, 1..4 passes), `pixelPerfect` (stair corner
  removal), `despeckle` (drop connected blobs under n cells), `outlineOnly`, `silhouette`,
  `longShadow` (hard diagonal ray), `scanlines` (recolor every n-th row). Parameterized ops
  open an inline options row in the FX menu.
- **New lattices**: `hexFlat` (flat-top hexagons, odd-q offset — the other hex orientation)
  and `rhombille` (each pointy-top hexagon split into three 60° lozenges — the isometric-cube
  tiling). Both ride the generic polygon pipeline: painting, flood fill, outline, metaball,
  conversion, rotation.
- **Hit-test fix**: the hex cube-rounding tie-break was broken twice over — a corrupted
  deviation (`rz - -qf - rf` parses as `rz + qf - rf`) and a missing final `else` branch that
  left invalid cubes on ties. Fixed in all three hex-family builders.

## Capabilities

### Modified

- `metaball-rendering`: block-unit super-pixels, fuse-all merging, contour stroke mode.
- `pixel-styling`: the extrude render mode and its knobs.
- `grid-types`: the hexFlat and rhombille lattices.

### Added

- `selection-pixel-ops`: the morphology op family on the selection ink.

## Non-Goals

- Texture effects (grain/grunge/halftone/hatch) on non-square grids — the region scanner is
  square-buffer based; separate change.
- Node-graph exposure (`mod.*`) for the pixel ops — the destructive selection path ships
  first; nodes are a follow-up.
- Cluster-level metaball units on non-square grids (connected-component kernels).
