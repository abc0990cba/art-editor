# sub-cells — Delta

## ADDED Requirements

### Requirement: Sub-cell detail

The editor SHALL let the user divide every pixel cell into ×1, ×2, or ×3 sub-cells; drawing tools
SHALL operate at sub-cell resolution while the connector tool and cell hit-testing for connectors
stay on the pixel grid.

#### Scenario: Finer detail

- **WHEN** sub-cell ×2 is active on a 16×16 grid and the user paints
- **THEN** the buffer resolution is 32×32 sub-cells and a painted mark occupies one quarter of a
  pixel cell

#### Scenario: Resize preserves detail

- **WHEN** the sub-cell factor changes from ×1 to ×2
- **THEN** every painted sub-cell keeps its color and position in the finer buffer

### Requirement: Rendering of sub-cells

Sub-cells SHALL render as smaller styled shapes that fill their fraction of the parent cell, and
SHALL merge under metaball mode like any other cell.

#### Scenario: Sub-cell blobs

- **WHEN** metaball mode is on with sub-cell ×3 and neighboring sub-cells are painted
- **THEN** they merge into one smooth blob through the shared geometry engine
