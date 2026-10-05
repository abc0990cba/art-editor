# Proposal: fix-corner-bridge-web

## Why

The Corner + Bridge junction overlay is a diamond whose vertices sit at the midpoints of the
four cell edges meeting at the shared corner. Its edge is only ≈0.707 cell and fillet tangent
lengths clamp to half the edge run, so at a concave radius of ~35% or more the fillets consume
the whole diamond and the bridge degenerates into a **circle** (at the default-ish 40% every
junction renders as a literal disc). The overlay is also a separate stamped path: its points
aim perpendicular to the connection axis and it meets each cell at single points, so the
junction reads as a blob glued onto the corner instead of the two squares joining.

## What Changes

- Remove the bridge overlay. When connectivity is `corner-bridge`, the silhouette loop itself
  grows a **square web** through each junction: every pinch vertex (the loop point visited
  twice — the shared corner of two diagonally-touching same-color cells with both orthogonal
  neighbors empty) is replaced by a three-point square detour into each empty corner, sized by
  the concave radius (0 ⇒ identical to `corner` mode).
- The detour corners are rounded by the existing fillet pipeline: the two reflex corners get
  the concave radius, the outer corner gets the convex radius — tangent-continuous, axis edges
  aligned with the cell grid, both radius sliders at work, never a circle at any radius.
- The bridge becomes part of the single silhouette path (no second same-color path, no evenodd
  interplay).

## Capabilities

### Modified

- `pixel-styling` — MODIFIED requirement: Diagonal connectivity modes (`corner-bridge` is now a
  fused square web, not an overlay); REMOVED requirement: Junction overlay alignment (overlay no
  longer exists); ADDED requirement: Junction web fusion (square detour, tangent fillets,
  symmetry, envelope).

## Non-Goals

- Changing `corner` pinch behavior or metaball junction kernels
- Per-junction bridge sizing or a dedicated bridge-size slider
- Clamping the web at the canvas border (the overlay could extend half a cell beyond the
  canvas too; behavior parity is kept)
