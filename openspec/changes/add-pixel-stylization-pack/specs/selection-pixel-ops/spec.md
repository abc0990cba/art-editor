# selection-pixel-ops — Delta

## ADDED Requirements

### Requirement: Pixel morphology ops on the selection

The editor SHALL offer one-click pixel-art morphology post-ops on the selection ink (square
grid, undoable, baked through the standard selection path like the stylize ops):

- `blockify` — quantize the selection to `size`×`size` (2..8) aligned blocks; any painted
  cells SHALL turn the whole block into the majority value (ties SHALL resolve to the smaller
  palette value); unpainted blocks SHALL stay empty.
- `dilate` / `erode` — grow into / retreat from empty 8-neighbors by `steps` (1..4) single-cell
  passes.
- `pixelPerfect` — remove every pixel whose two orthogonal neighbors are inked while the
  diagonal between them is empty (stair corners), judged against the input snapshot in one
  pass.
- `despeckle` — remove connected components (8-neighborhood, per value) smaller than `size`
  (2..6) cells.
- `outlineOnly` — keep only cells with at least one empty 8-neighbor.
- `silhouette` — recolor every cell to the current color, keeping owners.
- `longShadow` — project a hard ray from every ink cell along a diagonal until the bounds or
  other ink stop it, in the current color.
- `scanlines` — recolor every `size`-th buffer row (2..8) of the ink to the current color.

All ops SHALL be deterministic and integer-exact.

#### Scenario: Blockify quantizes to the pixel grid

- **WHEN** ink covers parts of two 2×2 blocks and blockify 2 runs
- **THEN** both blocks render fully painted in their majority values and empty blocks stay
      empty

#### Scenario: Pixel-perfect cleans a stair

- **WHEN** the ink forms a 2×2 L with one corner (`XX` / `.X`) and pixel-perfect runs
- **THEN** the corner pixel is removed, leaving a clean diagonal

#### Scenario: Despeckle keeps real shapes

- **WHEN** the ink holds a 1-cell speck, a 2-cell blob and a lone third speck, and despeckle
      ≥ 2 runs
- **THEN** only the 2-cell blob survives

#### Scenario: Parameterized ops expose options

- **WHEN** a parameterized op (blockify, dilate, erode, despeckle, scanlines, long shadow) is
      clicked in the selection FX menu
- **THEN** an inline options row offers the parameter values and applies on choice
