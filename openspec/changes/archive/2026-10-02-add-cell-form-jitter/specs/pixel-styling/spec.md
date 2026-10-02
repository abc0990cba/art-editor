# pixel-styling — Delta

## MODIFIED Requirements

### Requirement: Independent X/Y stretch

The editor SHALL let the user scale each pixel's box independently in width and height from 5% to
100% of the cell, keeping it centered. The editor SHALL additionally offer deterministic
per-cell variation: a size spread (`style.sizeJitter`, 0–100%, default 0) that shrinks each
cell's figure by a smooth seeded noise factor, an angle spread (`style.angleJitter`, 0–180°,
default 0) that offsets each rotated form's angle, and a seed (`style.jitterSeed`, 1–9999)
making the variation reproducible. With both spreads at zero the rendering SHALL be identical
to the un-varied path, including the run-merge fast path.

#### Scenario: Stretched dots

- **WHEN** size X is 100% and size Y is 40%
- **THEN** each painted cell renders as a horizontal pill touching its left and right cell edges

#### Scenario: Organic scatter

- **WHEN** the user raises size spread to 60% on a filled region
- **THEN** cell figures vary smoothly in size (neighboring cells correlate, no checkerboard
  flicker) and no figure exceeds its un-varied size

#### Scenario: Reproducible field

- **WHEN** the same document is reloaded or the seed is set back to a previous value
- **THEN** the per-cell size and angle variation is identical to before

#### Scenario: Angle spread on rotated forms

- **WHEN** the form is `square` with rotation 0 and angle spread is set to 90°
- **THEN** each cell's square gains a deterministic angle within ±45° of the base rotation

#### Scenario: Zero spread is free

- **WHEN** both spreads are 0 on a large plain-square document
- **THEN** rendering is unchanged and same-color horizontal runs still merge into single
  rectangles
