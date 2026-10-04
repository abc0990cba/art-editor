# Proposal: add-pen-tool

## Why

The pixel editor draws straight lines and fixed shapes, but has no way to author smooth curves:
every curved outline must be approximated by hand with the pencil. Popular vector editors
(Illustrator, Inkscape) solve this with a pen tool — anchor points, control handles, and
rubber-band previews — and the editor's parametric object system is a natural host for it.

## What Changes

- **Pen tool** (`F`) on the canvas rail: click places a corner anchor with a straight rubber-band
  segment; click-drag places a smooth anchor whose mirrored handles follow the pointer. Clicking
  the first anchor (or a Close action) closes the path; Enter commits the draft to the active
  layer as one undoable object; Escape cancels.
- **On-canvas editing while drafting**: anchors drag (handles follow), control handles drag
  (mirrored by default, Alt breaks the mirror, Ctrl snaps the handle to 15°), segment drags bend
  the curve, double-click toggles an anchor smooth/corner or inserts an anchor on a segment,
  Delete removes the picked anchor. The overlay draws the path skeleton, anchor squares, handle
  knobs and a close-hint on the first anchor; the staged pixel preview shows the real ink live.
- **Re-editable committed curves**: on square grids without symmetry the draft commits as a
  parametric `source.bezier` object (the serialized `d` string plus width/stroke/fill params);
  double-clicking such an object with the pen reopens it with every anchor and handle, and the
  commit replaces the object in place (one undo step).
- **Straight-line automation**: Shift always snaps segments to 45° steps; sticky chips (Free /
  45° / Ortho) in the tool settings govern the rubber band and handle dragging. Panel actions:
  Close, Smooth all (Catmull-Rom auto handles), Simplify (error-bounded anchor reduction), Clear.
- **Stroke width**: 1–16 cells, stamped with the pencil's circle tip so a width-N pen curve is
  exactly a size-N brush stroke along the path; closed paths optionally fill (ShapePaint
  fill/stroke styling shared with the shape tools).

## Capabilities

### Modified

- `drawing-tools`: new pen-tool requirements (draft editing model, snapping, commit and re-edit
  semantics, width/fill styling).

## Non-Goals

- Multi-subpath drafts (one path at a time; starting away from a closed draft begins a new one).
- Node editing of committed paths with tools other than the pen (no marquee-select of anchors).
- Coverage-based anti-aliased rasterization — cells stay palette-indexed; the curve is flattened
  and Bresenham-stamped like every other tool.
- Pattern fills for pen paths (ShapePaint `pattern` commits as the solid main color for now).
