# Design: add-corner-styles

## Style fields

`PixelStyle` gains `convexRadius: number`, `concaveRadius: number` (0–0.5) and
`cornerStyle: 'arc' | 'chamfer'` (default `'arc'`; outline defaults convex `radius`, concave
`0`). The existing `radius` stays the shared slider for pixels mode. `project.ts` validates the
new fields with the same clamps and falls back to defaults for legacy files.

## Chamfer in pixels mode

`roundedRectPath` gains the style switch: for each corner with radius `r`, chamfer replaces the
`A` arc with `L` to the same tangent end point — the tangent length math is unchanged, so the
clamping (half of min box side, per-corner radius) is reused as is.

## Convex/concave in outline mode

`roundedOutlinePath` already computes a turn cross product per corner. Convexity is decided per
loop by majority: for a simple closed staircase loop the dominant turn sign belongs to convex
corners (a rectangle has 4 vs 0; an L has 5 vs 1; a plus has 12 vs 4). Fillet tangent length
`t = min(rConvex|concave, prevLen/2, nextLen/2)`; sweep flag unchanged. Chamfer style replaces
the `A` command with `L` to the same end point (no sweep needed).

## Direction invariance

The marching-squares trace and the fillet math use local segment directions only — no absolute
orientation — so invariance holds by construction; the new tests lock it in. Helper in the test:
rotate cell coordinates by 90° and compare path point sets after applying the same rotation to
parsed path coordinates.

## UI

Outline mode: two sliders (Convex radius / Concave radius) instead of the single corner radius.
Pixels and outline modes: an Arc / Chamfer chip pair under the radius controls. i18n:
`style.convex`, `style.concave`, `style.cornerStyle`, `style.corner.arc`, `style.corner.chamfer`.

## Testing

Unit tests: chamfer pixels diamond (radius 50%, no `A` commands), chamfer outline (no `A`),
convex-only rounding (concave corners stay sharp — no arc near the inner corner), rotation
invariance for outline and metaball pairs in all three adjacency directions, short-edge clamping
(cells in an L with radius 50% produce a valid closed path).
