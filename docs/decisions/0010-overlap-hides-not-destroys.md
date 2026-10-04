# ADR-0010 — Within a layer, overlap hides instead of destroying

- Status: accepted
- Date: 2026-10-04
- Related: [doc-and-scene module](../modules/doc-and-scene.md); [canvas-stage module](../modules/canvas-stage.md)

## Context

Painting over ink on the same layer used to steal the covered cells from the object beneath
(`commitStroke`/`commitStrokeParametric` → `stealCells`), and moving/scaling a selection stole
its destination footprint from the objects under it. The stolen ink was gone permanently, so
moving the covering figure away exposed holes in the figures beneath — the composite looked
corrupt ("missing pixels"). Only parametric single-color shapes (whose graph regenerates ink
from parameters) healed themselves, which made the behavior inconsistent between two shapes
drawn identically. The one-owner-per-cell invariant also made the eraser and selection moves
destructive to ink that was never visible at the erased/moved spot.

## Decision

1. **Objects keep their full ink.** Painting, moving and scaling never remove another object's
   cells. The composite already paints bottom → top with last writer wins per cell
   (`buildComposite`), so tree order alone decides what is visible; a covered cell stays owned
   by the object beneath and reappears when the covering object moves, hides or is deleted.
2. **`stealCells` is reserved for deliberately destructive callers**: the eraser (it punches
   every object of the active layer under the stroke, matching its live preview pixel for
   pixel) and bakes (`bakeSelection` freezing the visible composite onto its owners). The
   move/transform destination-claim blocks were removed from the selection and transform
   slices.
3. **Flat legacy documents keep their raster semantics** — `moveSelectionFlat`,
   `transformFlat` and `paintCellsFlat` keep writing the shared buffers directly; the rule
   above is a scene-model rule.

## Consequences

- Moving a figure over another one and away leaves both figures intact; `deleteSelection`,
  layer hiding and z-order reordering behave like layer-based editors.
- The eraser stays destructive by design: erasing a visible overlap also erases the hidden
  ink beneath it. This is the one deliberate deviation from full object semantics — it keeps
  the eraser's live preview and its commit identical.
- Scale/rotate (`transformSelection`) still bake the movers from the *visible* composite ink
  (a source graph cannot express an affine map), so a transform of a partially covered object
  freezes only what was visible. Undoable, as before.
- During a move drag the ghost erases the mover's composite cells, so ink revealed from
  beneath pops in on release rather than appearing live under the cursor; the staged overlay
  cannot cheaply render "doc minus movers". Recorded as a known preview limit.
- `compactElements` keeps treating `cellObj` (visible ownership) as liveness — a fully hidden
  scene object can still be dropped by the flat-doc compaction paths, which only run on
  legacy docs.

## Alternatives considered

- Restoring stolen cells on move-away — rejected: the information "who was covered" is lost
  at steal time for plain-pixel objects; there is nothing to restore from.
- Top-figure-only erasing (true object semantics for the eraser too) — deferred: the live
  preview cannot cheaply show ink reappearing from beneath during the stroke, so erased areas
  would visibly pop back at commit. Revisit only with a preview pipeline that can composite
  "doc minus top owner" per frame.
