# metaball-rendering — Delta

## MODIFIED Requirements

### Requirement: Local-size metaball splats on non-square grids

On non-square grids each painted cell's metaball kernel splat SHALL scale with the local cell
size (the square root of the cell's shortest true edge) instead of using the unit kernel, so
sub-unit cells (radial inner rings, octasquare gap squares) render proportionate blobs rather
than fusing into a saturated mass. The square root SHALL keep same-ring neighbors merging:
two adjacent radial sectors SHALL still form one blob under the default merge settings. A
cell whose polygon has fewer than three true corners (the radial half-disc wedges) SHALL
measure its merged collinear run — the half disc's diameter — as its shortest true edge, so
its blob covers the wedge it represents.

#### Scenario: Lone inner-ring cell renders proportionate

- **WHEN** a single inner-ring sector of a radial grid is painted in metaball mode
- **THEN** its blob stays close to the cell's own size instead of swelling to the unit kernel
  radius

#### Scenario: Adjacent sectors still merge

- **WHEN** two adjacent sectors of a radial ring are painted in metaball mode with moderate
  strength
- **THEN** the traced contour is a single loop

#### Scenario: Half-disc center cells merge

- **WHEN** both innermost half-disc sectors of an even-graded radial grid are painted in
  metaball mode
- **THEN** the traced contour is a single blob covering the center disc

## ADDED Requirements

### Requirement: Radial metaball disc clamp

On the radial grid the metaball field SHALL be clamped to the painted disc (radius = ring
count): field nodes beyond the disc SHALL be zero, so blobs close along the canvas circle
like square-grid blobs close along the canvas edge, and never spill into the empty square
margin around the disc. The clamp SHALL apply to the diffusion-guides overlay too (same field
builder).

#### Scenario: Outer-ring blob stays inside the disc

- **WHEN** a single outer-ring sector is painted in metaball mode at maximum strength
- **THEN** the traced contour closes at or inside the disc boundary and no field node beyond
  the disc radius is hot
