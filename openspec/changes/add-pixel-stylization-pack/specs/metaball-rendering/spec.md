# metaball-rendering — Delta

## ADDED Requirements

### Requirement: Block-unit super pixels

The editor SHALL offer a metaball blob unit setting (`cell` | `block`, square grid only). With
`unit: 'block'` and a block size of 2..8 cells, every fully painted single-color block of the
aligned block grid SHALL collapse into one kernel whose radius scales with the block edge, and
edge-adjacent same-color blocks SHALL be bridged by a capsule of kernels so neighbors fuse into
one smooth mass. Blocks that are incomplete or hold more than one color SHALL keep the classic
per-cell kernels; stray small pixels SHALL behave as plain cell blobs that still merge into
nearby block blobs.

#### Scenario: A 5×5 brush pixel acts as one big blob

- **WHEN** a full 3×3 block renders with `unit: 'block'`, `blockSize: 3`
- **THEN** the traced field shows one loop whose extent covers the block area, not nine
      separate cell-sized loops

#### Scenario: A 5×5 block connects with a 1×1 pixel

- **WHEN** a complete block and a single painted cell near it render in block-unit mode
- **THEN** both contribute kernels to the same per-color field and merge according to the
      shared strength/threshold controls

#### Scenario: Incomplete blocks do not hallucinate blobs

- **WHEN** one cell of an otherwise full block is erased and a stray pixel sits far away
- **THEN** the block renders through per-cell kernels and the stray pixel forms its own loop

### Requirement: Fuse-everything merge

The editor SHALL offer a `fuseAll` metaball toggle (square grid only, default off). When on,
metaball rendering SHALL build one field set over the whole document — bypassing per-layer
isolation and frozen per-element style grouping — using the doc-level metaball settings;
per-color isolation SHALL still apply.

#### Scenario: Differently-styled strokes fuse

- **WHEN** two strokes with different frozen metaball strengths render with `fuseAll` on
- **THEN** the geometry contains one merged path per color instead of one per style group

#### Scenario: Layers fuse

- **WHEN** two layers each hold ink and `fuseAll` is on
- **THEN** the field set is built once over the visible composite instead of per layer

## Modified Requirements

### Requirement: Metaball merge mode

The editor SHALL offer a metaball render mode in which adjacent painted cells merge into smooth
organic blobs. Kernel strength (0..100) SHALL scale the kernel radius from about cell size up to
roughly 1.6 cells. The merge SHALL additionally be shaped by a merge threshold (iso 0.2..0.8),
a falloff curve (tight / smooth / gooey), per-color isolation, straight edges at the canvas
border, and field quality. Non-square grids SHALL honor the same controls through one shared
field builder. The metaball field and its controls are shared verbatim by the contour render
mode.

### Requirement: Contour render mode

The editor SHALL offer a `contour` render mode (square grid) that traces the same metaball
merge field and emits the loops as unfilled stroked paths of `metaball.strokeWidth`
(0.05..1 cell) in the field's color. The contour SHALL render identically on canvas, PNG and
SVG output.

#### Scenario: Contour emits strokes, not fills

- **WHEN** a metaball document renders in contour mode
- **THEN** every traced loop is exported with a `stroke` and no `fill`, at the configured
      line width
