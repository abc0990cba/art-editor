# sub-cells Specification

## Purpose
TBD - created by archiving change add-editor-core. Update Purpose after archive.

## Requirements

### Requirement: Legacy sub-cell buffer

The document model SHALL keep the global `sub` factor (×1, ×2, ×3) as a legacy property.
Documents saved with sub-cell detail SHALL load, render, export and resize unchanged, and all
buffer math SHALL keep operating at the `cols·sub × rows·sub` resolution. The settings UI SHALL
NOT offer a control to change the global sub-cell factor (new documents use ×1).

#### Scenario: Legacy document loads with detail intact

- **WHEN** a project saved with sub-cell ×2 is opened
- **THEN** the buffer stays at double resolution and every painted sub-cell keeps its color and
  position

#### Scenario: No sub-cell control

- **WHEN** the user opens the settings panel on any grid
- **THEN** no control offers a ×1/×2/×3 sub-cell switch

### Requirement: Drawing scale is the brush pixel size

Drawing scale SHALL be controlled by the brush pixel size (see the drawing-tools spec), not by a
global sub-cell factor. Mixed scales SHALL be representable in one document: a pixel of one size
may later be detailed with pixels of a smaller size.

#### Scenario: Mixed pixel sizes

- **WHEN** the user paints with pixel size 5 and then paints inside that block with pixel size 2
- **THEN** both scales coexist as cell values in the same buffer, each snapped to its own size
  grid

### Requirement: Rendering of sub-cells

Legacy sub-cells SHALL render as smaller styled shapes that fill their fraction of the parent
cell, and SHALL merge under metaball mode like any other cell.

#### Scenario: Sub-cell blobs

- **WHEN** metaball mode is on with legacy sub-cell ×3 and neighboring sub-cells are painted
- **THEN** they merge into one smooth blob through the shared geometry engine
