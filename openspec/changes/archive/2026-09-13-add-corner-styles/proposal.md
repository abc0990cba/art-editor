# Proposal: add-corner-styles

## Why

Corner treatment is currently one fixed recipe: circular arcs with a single radius, in pixels
mode per cell and in outline mode for every silhouette corner (convex and concave alike). Two
limitations hurt expressiveness and quality: users cannot differentiate outer corners from inner
corners of a silhouette, and there is no angular alternative to round arcs. The rounding also
needs documented guarantees that shapes stay correct in every arrangement — horizontal, vertical
and diagonal adjacency — across all render modes.

## What Changes

- Split the outline-mode rounding into `convexRadius` and `concaveRadius` (each 0–50% of the
  cell). The convex radius rounds the outer corners of a silhouette; the concave radius rounds
  the inner corners (e.g. the neck of a diagonal junction, the inner corner of an L-shape).
  Setting either to 0 keeps those corners sharp.
- Add a corner style setting `arc | chamfer` on the document style. `chamfer` replaces the
  circular arc with a straight 45° cut of the same tangent length, in pixels mode (per cell
  corner, respecting per-corner radii) and in outline mode (per silhouette corner).
- UI: in outline mode the corner radius slider is replaced by two sliders (Convex / Concave);
  a corner-style chip pair (Arc / Chamfer) is shown in pixels and outline modes. EN/RU labels.
  All settings are part of the document (undo, autosave, project round trip).
- Guarantee tests: horizontal, vertical and diagonal pairs produce geometrically equivalent
  (rotation/reflection-invariant) outlines in pixels, outline and metaball modes; fillets and
  chamfers are clamped to half of the adjacent edge so short edges never break the path.

## Capabilities

### Modified

- `pixel-styling` — ADDED requirements: separate convex/concave outline radii, chamfer corner
  style, and direction-invariant rounding guarantees.

## Non-Goals

- Per-corner radii in outline mode
- Superellipse (squircle) cell shapes
- Corner styles for metaball blobs (field-based rendering has no discrete corners)
