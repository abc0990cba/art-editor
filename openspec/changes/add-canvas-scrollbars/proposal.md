# Proposal: add-canvas-scrollbars

## Why

At high zoom the canvas viewport is a tiny window into the artwork, and the only ways to move it are wheel-pan (space/middle drag) or repeated wheel events. Standard editor affordance — scrollbars — is missing, so jumping across a zoomed-in canvas is slow.

## What Changes

- **Overlay scrollbars** on the canvas stage: a horizontal bar along the bottom edge and a vertical bar along the right edge. The thumb shows which part of the canvas is visible; dragging it pans the viewport, clicking the track centers the viewport on the clicked point.
- Bars appear only when the canvas is larger than the viewport on that axis and share the corner where both meet. Dragging a pinned thumb past the edge keeps panning (overscroll stays possible, as with drag-pan).

## Capabilities

### Modified

- `canvas-grid`: the viewport navigation requirement gains overlay scrollbars as an additional navigation affordance.

## Non-Goals

- Replacing the existing wheel zoom / drag pan / fit interactions.
- A minimap or thumbnail preview inside the scrollbar tracks.
