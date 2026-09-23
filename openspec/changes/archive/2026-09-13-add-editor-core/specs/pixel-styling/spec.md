# pixel-styling — Delta

## ADDED Requirements

### Requirement: Corner radius control

The editor SHALL let the user set a uniform corner radius from 0% (sharp square) to 50% (fully
round) of the pixel box, and SHALL offer an advanced per-corner mode with independent radius
sliders for top-left, top-right, bottom-right, and bottom-left corners.

#### Scenario: Round all pixels

- **WHEN** the uniform radius slider is set to 50%
- **THEN** every isolated painted cell renders as a circle in preview and export

#### Scenario: Per-corner override

- **WHEN** per-corner mode is enabled and only the top-left corner is set to 50% while others stay 0%
- **THEN** each painted cell renders with one rounded corner and three sharp corners

### Requirement: Independent X/Y stretch

The editor SHALL let the user scale each pixel's box independently in width and height from 5% to
100% of the cell, keeping it centered.

#### Scenario: Stretched dots

- **WHEN** size X is 100% and size Y is 40%
- **THEN** each painted cell renders as a horizontal pill touching its left and right cell edges

### Requirement: Shape presets

The editor SHALL offer one-click shape presets (square, rounded, circle) that set the radius
controls accordingly.

#### Scenario: Circle preset

- **WHEN** the user clicks the circle preset
- **THEN** radius becomes 50% and isolated pixels render as circles
