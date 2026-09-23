# canvas-grid — Delta

## ADDED Requirements

### Requirement: Overlay scrollbars for the canvas viewport

The canvas stage SHALL show a horizontal scrollbar along the bottom edge and a vertical scrollbar along the right edge whenever the canvas extent is larger than the visible viewport on that axis. The thumb SHALL map linearly to the visible doc-space window. Dragging the thumb SHALL pan the viewport correspondingly (including past the canvas edges); clicking a track point SHALL center the viewport on that point. A scrollbar axis SHALL be hidden while the whole canvas fits the viewport on that axis.

#### Scenario: Quick navigation at high zoom

- **WHEN** the user zooms in so only part of the canvas is visible and drags the horizontal thumb to the middle
- **THEN** the viewport pans smoothly to show the middle of the canvas without touching the wheel or space-drag.

#### Scenario: Hidden when everything fits

- **WHEN** the whole canvas fits inside the viewport on an axis
- **THEN** no scrollbar is shown for that axis.
