# Design: fix-corner-bridge-web

## Context

`bridgeOverlays` (`geometry/outline.ts`) stamped a filleted diamond per junction as a separate
same-color path. Structural flaws: the diamond's short edges (≈0.707 cell) plus the half-run
fillet clamp make the shape degenerate into a circle once the concave radius passes ~35%, and
an overlay cannot be tangent-continuous with the silhouette it is glued to.

## Decisions

### Fuse the web into the silhouette loop

After `simplifyLoop`, when connectivity is `corner-bridge`, every pinch vertex — a coordinate
the loop visits twice, which is exactly the case "two same-color cells touch diagonally and
both orthogonal neighbors are empty" — is replaced at each visit by a three-point detour. With
incoming unit direction `i`, outgoing unit direction `o`, and `s = concaveRadius / doc.sub`:

```
P1 = v − s·i      (leave the incoming edge early)
P2 = v − s·i + s·o (square corner inside the empty quadrant)
P3 = v + s·o      (join the outgoing edge early)
```

Rationale: the loop already encodes everything (no cell rescan, both diagonal orientations and
mirrors fall out of the local directions), the result is one simple closed path (evenodd-safe),
and `filletPath` rounds the detour for free — reflex corners with the concave radius, the outer
corner with the convex radius, tangent everywhere. Because the tangent clamp is `min(r, run/2)`
and the detour edges have length `s = rConcave`, the web is a smooth S-wave at high radii and a
square step at low radii — never a circle.

### Why not rotate the diamond

Rotating the overlay 45° (tips along the connection axis) keeps the two fundamental defects: a
stamped overlay still meets the cells at points (creases), and the short-edge circle collapse
returns at high radii. The fused web removes the overlay concept entirely.

## Non-Goals

- Metaball corner kernels (gooey by construction, unaffected)
- Border clamping of the web (parity with the old overlay's half-cell overhang)
