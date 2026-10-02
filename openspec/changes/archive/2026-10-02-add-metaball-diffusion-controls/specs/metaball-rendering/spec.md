# metaball-rendering — Delta

## MODIFIED Requirements

### Requirement: Metaball merge mode

The editor SHALL offer a metaball render mode in which adjacent painted cells merge into smooth
liquid blobs, controlled by a strength value 0–100 that grows the merge radius from the cell size
up to roughly 1.6 cells. The merge SHALL additionally be shaped by a merge threshold
(`metaball.iso`, 0.2–0.8, default 0.5) and a falloff curve (`metaball.falloff`:
`smooth` cubic / `soft` quadratic / `tight` linear, default `smooth`), and both square and
non-square grids SHALL honor the same controls through one shared field builder.

#### Scenario: Two cells merge

- **WHEN** metaball mode is enabled with moderate strength and two horizontally adjacent cells are
  painted
- **THEN** the viewport and export show a single smooth blob spanning both cells instead of two
  separate shapes

#### Scenario: Toggle back to shapes

- **WHEN** metaball mode is disabled
- **THEN** cells render as discrete styled pixel shapes

#### Scenario: Threshold fattens blobs

- **WHEN** the user lowers the merge threshold from 0.5 to 0.3 on an unchanged drawing
- **THEN** every blob grows (never shrinks) because the same field crosses the threshold further
  from the cell centers

#### Scenario: Falloff changes the skirt

- **WHEN** two cells are painted and the falloff chip switches from `smooth` to `tight`
- **THEN** the neck between the two blobs becomes narrower at equal strength and threshold

#### Scenario: Non-square parity

- **WHEN** the same single-cell layout is drawn on the hex grid and on the square grid with equal
  strength, threshold and falloff
- **THEN** both grids respond to the threshold and falloff controls in the same way

### Requirement: Field quality

The editor SHALL expose a field quality setting (low/medium/high/ultra — samples 2/4/6/8 per
cell) controlling samples per cell so users can trade contour smoothness for responsiveness on
large grids.

#### Scenario: Large grid stays responsive

- **WHEN** a 100×100 grid uses low quality
- **THEN** geometry recomputes fast enough to follow a pencil stroke without visible lag

#### Scenario: Ultra level

- **WHEN** the user picks the ultra quality chip
- **THEN** fields sample at 8 nodes per cell and contours smooth accordingly

## ADDED Requirements

### Requirement: Diffusion guides overlay

While metaball mode is active the editor SHALL offer a "Diffusion guides" overlay toggle
(default off) that renders three aids on the canvas without ever affecting export: the field's
threshold contour as a dashed accent line, a half-cell grid (square grid, pitch divided by the
sub-detail factor of 2), and a circle of the effective kernel radius at the hovered cell while a
paint tool is in use.

#### Scenario: Contour follows painting

- **WHEN** diffusion guides are enabled and the user paints cells in metaball mode
- **THEN** a dashed line traces where the field crosses the merge threshold, updating as cells
  are added or erased

#### Scenario: Half-cell grid

- **WHEN** diffusion guides are enabled on a square grid with sub-detail 1
- **THEN** guide lines appear at half-cell pitch between the normal grid lines, and at half of
  the sub-cell pitch when sub-detail is above 1

#### Scenario: Kernel ring shows fusion reach

- **WHEN** diffusion guides are enabled and the cursor hovers a cell with a paint tool
- **THEN** a circle of the current kernel radius is drawn around that cell so the user can see
  which neighboring cells the next stroke will fuse with

#### Scenario: Guides never export

- **WHEN** SVG or PNG is exported while diffusion guides are visible
- **THEN** the export contains only the artwork, no contour lines, half-cell grid or ring
