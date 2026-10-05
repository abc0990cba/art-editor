# selection-generative-filters — Delta

## ADDED Requirements

### Requirement: Generative filters on the selection

The editor SHALL offer six generative auto-filters on the selection ink (square grid, undoable,
baked through the standard selection path like the other effect families). All ops SHALL be
deterministic, integer-exact, and SHALL preserve source palette values and element owners — the
palette is never touched.

#### Scenario: Blobify fuses nearby strokes

- **WHEN** two ink dots sit within each other's kernel radius and blobify runs
- **THEN** the cells between them are inked with the value + owner of the strongest contributor,
      forming one fused blob; every original cell survives

#### Scenario: Smoothen fills concave corners

- **WHEN** a 2×2 block holds exactly three inked cells and smoothen runs
- **WHEN** the fourth cell is empty
- **THEN** it becomes ink (any values count); jaggied diagonals turn into smooth staircases over
      the chosen passes

#### Scenario: Figurefy draws a figure inside every pixel

- **WHEN** an ink cell is figurefied at scale k with a chosen figure in figure mode
- **THEN** it becomes a k×k block anchored at the selection box origin whose sub-cells are inked
      exactly where the cell-shape hit test places the figure (any registered cell form, drawn
      with the default shape params), inheriting the source value + owner; cut mode inverts the
      mask over the full block; blocks clip at the buffer edge

#### Scenario: Patternize re-masks ink with a pattern

- **WHEN** patternize runs with a structured pattern, scale and density
- **THEN** source ink cells survive exactly where `patternAt` is true at their buffer coordinates
      (inverted when invert is on), so a silhouette turns into dots, checker, grid, hatch,
      stripes, bricks, rings or zigzag

#### Scenario: Drip grows melt trails from run ends

- **WHEN** drip runs along a direction with length, variation and seed
- **THEN** every source cell without a source-ink neighbor in that direction grows one hash-varied
      trail of empty cells (stopped by source ink and the buffer edge); interior cells grow nothing

#### Scenario: Dissolve removes noise-gated pixels

- **WHEN** dissolve runs with amount and clump scale
- **THEN** ink survives exactly where a seeded per-cell hash (scale 1) or smooth value noise
      (scale > 1) exceeds the amount; the same seed always yields the same result

### Requirement: Mixed UI depth

Blobify, figurefy and patternize SHALL open a live-preview popover whose slider/chip changes
repaint a ghost of the result before one Apply commits; smoothen, drip and dissolve SHALL apply in
one click from inline preset rows (passes / directions / amounts).
