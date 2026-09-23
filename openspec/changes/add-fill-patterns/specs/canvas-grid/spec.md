# canvas-grid — Delta

## MODIFIED Requirements

### Requirement: Grid sizing

The editor SHALL provide width and height inputs for the pixel grid constrained to 1–512 cells
each, plus grouped size presets by popular aspect ratios — 1:1, 4:3, 3:2, 16:9, 21:9, 2:1,
10:9 (Game Boy) and 8:7 (NES) — that set both dimensions at once. Every base preset size SHALL
also offer an odd sibling (+1 on both axes, stepping down by 1 when +1 would exceed the size
limit), so the grid gains a central row and column that symmetry axes can anchor on. The
editor SHALL resize the document buffer live when a value changes, preserving existing content
anchored at the top-left corner.

#### Scenario: Resize wider

- **WHEN** the user changes grid width from 16 to 24 while cells at (3,3) are painted
- **THEN** the buffer becomes 24 columns wide and the pixel at (3,3) remains painted

#### Scenario: Boundary clamping

- **WHEN** the user enters 0 or 513 for a grid dimension
- **THEN** the value is clamped into the 1–512 range

#### Scenario: Apply a square preset

- **WHEN** the user picks the 128×128 preset in the 1:1 group
- **THEN** the grid becomes 128×128 cells and existing artwork is kept anchored top-left

#### Scenario: Apply an aspect-ratio preset

- **WHEN** the user picks 128×72 in the 16:9 group
- **THEN** the grid becomes 128×72 cells and existing artwork is kept anchored top-left

#### Scenario: Odd variant for symmetry

- **WHEN** the user picks the odd sibling 129×73 of the 128×72 preset and enables vertical
  mirror symmetry
- **THEN** the grid has a central column (column 64, zero-based) that the mirror maps onto
  itself, so strokes can be centered on it
