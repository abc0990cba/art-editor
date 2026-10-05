# metaball-rendering — Delta

## ADDED Requirements

### Requirement: Local-size metaball splats on non-square grids

On non-square grids each painted cell's metaball kernel splat SHALL scale with the local cell
size (the square root of the cell's shortest true edge) instead of using the unit kernel, so
sub-unit cells (radial inner rings, octasquare gap squares) render proportionate blobs rather
than fusing into a saturated mass. The square root SHALL keep same-ring neighbors merging: two
adjacent radial sectors SHALL still form one blob under the default merge settings.

#### Scenario: Lone inner-ring cell renders proportionate

- **WHEN** a single inner-ring sector of a radial grid is painted in metaball mode
- **THEN** its blob stays close to the cell's own size instead of swelling to the unit kernel
  radius

#### Scenario: Adjacent sectors still merge

- **WHEN** two adjacent sectors of a radial ring are painted in metaball mode with moderate
  strength
- **THEN** the traced contour is a single loop
