# color-picker — Delta

## ADDED Requirements

### Requirement: Radial color wheel picker

The editor SHALL provide an in-app color picker with a radial color wheel where the angle around
the center selects hue and the distance from the center selects saturation, a brightness (value)
slider, and a preview of the resulting color; dragging on the wheel or slider SHALL update the
active color live.

#### Scenario: Wheel drag updates color

- **WHEN** the user drags on the color wheel from the red region to the blue region
- **THEN** the active color changes continuously through intermediate hues while dragging

#### Scenario: Brightness slider

- **WHEN** the user sets the brightness slider to minimum
- **THEN** the active color becomes black regardless of hue and saturation

### Requirement: Hex entry

The color picker SHALL allow direct hex entry in 3-digit and 6-digit form with validation;
invalid input SHALL be rejected without changing the active color.

#### Scenario: Valid hex applies

- **WHEN** the user types `#7e2553` (or `7e2`) into the hex field and commits
- **THEN** the active color becomes that value and the wheel marker moves to the matching hue
  and saturation

#### Scenario: Invalid hex ignored

- **WHEN** the user types `#zzz` into the hex field
- **THEN** the active color is unchanged

### Requirement: Recent colors

The editor SHALL track recently used paint colors (deduplicated, newest first, capped at 12) and
SHALL show them as swatches in the color panel; clicking a recent swatch SHALL set the active
color; the list SHALL persist across reloads.

#### Scenario: Painting records a recent color

- **WHEN** the user paints with color X and X is not already the newest recent entry
- **THEN** X appears at the front of the recent colors row

#### Scenario: Recent survives reload

- **WHEN** the user reloads the editor
- **THEN** the recent colors row is restored
