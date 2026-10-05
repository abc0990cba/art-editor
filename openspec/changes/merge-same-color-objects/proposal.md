# Proposal: merge-same-color-objects

## Why

Dithered imports (ring screen, noise, error diffusion) and region-split imports decompose the
artwork into hundreds or thousands of single-color blocks, each a separate object on the canvas.
The picture looks right, but every dot is individually selectable, the layers panel drowns in
rows, project saves and SVG exports balloon, and there is no way back: the editor offers no
operation that reunites blocks of one color into a single figure.

## What Changes

- **«Merge same colors» action** in the layers panel action row: within each layer, all mergeable
  objects carrying the same palette value unite into one object per color. Mergeable means: no
  live node graph, no connectors, unlocked, visible (with its layer/group chain), and every cell
  holds one and the same palette value. Everything else (graphs, connector owners, locked or
  hidden objects, multi-color drawings) stays untouched, so the composite is byte-identical
  before and after.
- **Scope**: the action processes the current selection when it contains objects, otherwise the
  whole document. The selection remaps to the merged objects.
- One undoable step, like group/ungroup.

## Capabilities

### Added

- `scene-tree`: merge-same-colors requirements (merge semantics, candidate guards, scope,
  selection remapping, undo).

## Non-Goals

- Merging across layers, groups, or different frozen styles (would change z-order semantics or
  per-group rendering).
- Automatic merging at import time — the import dialog already yields one object per color when
  «Object per region» is off.
- SVG-export-side path concatenation: overlapping same-color subpaths would punch evenodd holes.
- Splitting multi-color user drawings into per-color objects.
