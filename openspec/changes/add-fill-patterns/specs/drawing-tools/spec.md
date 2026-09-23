# drawing-tools — Delta

## MODIFIED Requirements

### Requirement: Flood fill and eyedropper

The editor SHALL provide a flood fill tool that replaces the connected region of identical cell
values under the pointer, and an eyedropper that sets the active color from the hovered painted
cell. Flood fill SHALL run from every symmetry copy of the clicked seed; the eyedropper SHALL
ignore symmetry.

The fill tool SHALL support two fill styles. In **solid** style the region is replaced with the
active color, as before. In **pattern** style the region is replaced with a per-cell mix of the
active color and a configurable second color, where each cell picks between the two colors
according to:

- a **pattern**: Bayer 2×2, Bayer 4×4, Bayer 8×8 and Bayer 16×16 ordered dithering, positional
  noise dithering (deterministic for a cell's buffer position), interleaved gradient noise,
  a block checkerboard, a windowpane grid, cross-hatch, horizontal stripes, vertical stripes,
  diagonal stripes, zigzag rows, a dot grid whose dot size grows with the mix ratio,
  running-bond bricks whose mortar joints close as the mix ratio rises, and concentric rings
  around the clicked cell; and
- a **transition profile** producing the mix ratio: flat (a density slider), a vertical,
  horizontal, diagonal or reverse-diagonal gradient spanning the filled region's bounding box,
  or a radial gradient from the clicked cell.

Scaled patterns (checker, grid, hatching, stripes, zigzag, dots, bricks, rings) SHALL expose a
tile-size multiplier (pattern scale); noise patterns (noise, IGN) SHALL expose a grain setting
(the noise block size in cells).

Pattern fills SHALL be stable against the pixel grid (buffer-space coordinates, sub-cell
resolution on the square grid), SHALL respect edge connectivity of the active grid type, and
SHALL run from every symmetry copy of the clicked seed. On radial grids, sector and ring fill
scopes SHALL apply the pattern across the whole seed set as a single region, so gradients span
the wedge or ring. A fill that changes no cell SHALL NOT create a history entry.

#### Scenario: Fill an enclosed region

- **WHEN** flood fill is used inside a closed outline
- **THEN** only cells connected to the start cell adopt the new color

#### Scenario: Dithered gradient

- **WHEN** the pattern style is active with the Bayer 8×8 pattern and a radial transition, and
  the user clicks inside an enclosed region
- **THEN** the region becomes a two-color dither whose second color dominates near the click
  and fades outwards as ordered-dithered bands, and every symmetry copy shows the same fill

#### Scenario: Flat checkerboard texture

- **WHEN** the pattern style is active with the Bayer 2×2 pattern, a flat transition at 50%
  density and a second color
- **THEN** the whole filled region becomes a checkerboard alternating the active and second
  colors

#### Scenario: Sector/ring pattern fill

- **WHEN** on a radial grid the fill scope is ring, the pattern style with a vertical gradient
  is active, and the user clicks a ring cell
- **THEN** the entire ring is filled as one region with the pattern and the gradient spans the
  whole ring

### Requirement: Per-tool options

Double-clicking a tool in the toolbar SHALL open that tool's settings panel next to the rail;
changes SHALL apply immediately to subsequent drags. Paint tools (pencil, eraser, line,
rectangle, ellipse) SHALL expose their stroke thickness (the brush pixel size), the connector
SHALL expose its width, shape tools SHALL expose the geometry options listed in the shape
tools requirement, and tools without parameters SHALL say so. The fill tool SHALL expose its fill style (solid or pattern), the pattern, the transition
profile, the density of flat pattern fills, the pattern scale and noise grain where the chosen
pattern supports them, the second pattern color with a swap action, and a live preview of the
current pattern between the active and second colors. Esc, the close button or a click outside
the panel SHALL close it.

#### Scenario: Gear options

- **WHEN** the user double-clicks the gear tool, sets 12 teeth and a 30° rotation
- **THEN** the next gear drag draws a 12-tooth gear rotated by 30°

#### Scenario: Fill options

- **WHEN** the user double-clicks the fill tool, picks the pattern style with the dots pattern
  and a radial transition, and picks a second color
- **THEN** the next fill click distributes the two colors as a radially growing dot grid, and
  the preview canvas shows the same pattern
