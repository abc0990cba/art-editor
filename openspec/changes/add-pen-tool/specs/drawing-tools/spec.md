# Delta: drawing-tools — pen tool

## ADDED Requirements

### Requirement: Pen tool draws Bézier paths

The editor SHALL provide a pen tool that builds a path from anchors: a click places a corner
anchor connected by a straight segment, a click-drag places a smooth anchor with mirrored control
handles, and clicking the first anchor of an open path with at least two anchors SHALL close it.
The tool SHALL show a rubber-band preview from the last anchor to the pointer and render the
draft's pixels through the same staging preview that the commit produces.

#### Scenario: Straight polyline

- **WHEN** the user clicks three canvas positions with the pen and presses Enter
- **THEN** the active layer gains one object whose ink is the two straight segments

#### Scenario: Smooth point by drag

- **WHEN** the user presses, drags roughly 45° away and releases
- **THEN** the placed anchor carries mirrored handles shaped by the drag, and the neighboring
  segments render as curves in the staged preview

#### Scenario: Close on the first anchor

- **WHEN** the draft is open with at least two anchors and the user clicks the first anchor
- **THEN** the path closes and the preview shows the closing segment

### Requirement: On-canvas path editing

While a draft exists the pen tool SHALL let the user drag anchors (their handles travel along),
drag control handles (mirrored unless Alt is held; Ctrl snaps the handle angle to 15° steps), and
drag a segment to bend it. Double-clicking an anchor SHALL toggle it between corner and smooth;
double-clicking a segment SHALL insert an anchor there; Delete SHALL remove the picked anchor.

#### Scenario: Handle mirror and break

- **WHEN** the user drags a handle of a smooth anchor, then holds Alt and drags it again
- **THEN** the first drag moves the opposite handle symmetrically, the second moves only the
  grabbed handle

#### Scenario: Insert on a straight segment keeps it straight

- **WHEN** the user double-clicks the middle of a straight segment
- **THEN** a corner anchor appears at that point and both halves remain straight

### Requirement: Pen commit semantics

Enter SHALL commit the draft: the path rasterizes onto the active layer as one object in one
undoable step; Escape SHALL discard the draft; switching tools SHALL commit a non-empty draft.
On square grids without symmetry the object SHALL be a parametric `source.bezier` whose
parameters reproduce the committed cells exactly; otherwise the ink commits as plain pixels.
Double-clicking a committed `source.bezier` object with the pen SHALL reopen it for editing, and
the next commit SHALL replace that object in place.

#### Scenario: Parametric regeneration parity

- **WHEN** a path is committed on a plain square grid and the node re-evaluates from its
  parameters
- **THEN** the regenerated cells equal the committed ink

#### Scenario: Re-edit loop

- **WHEN** the user double-clicks a committed pen curve and moves an anchor, then presses Enter
- **THEN** the object updates in place with the new shape (one undo step returns the old shape)

### Requirement: Pen snapping and automation

Shift SHALL constrain the rubber band to 45° steps; a sticky setting SHALL offer Free, 45° and
Ortho (horizontal/vertical only) snapping. The tool settings SHALL provide Close, Smooth all
(every corner anchor gains auto Catmull-Rom handles), Simplify (anchors drop while the flattened
curve stays within tolerance) and Clear actions.

#### Scenario: Ortho drag

- **WHEN** the snap chip is set to Ortho and the user places the next anchor
- **THEN** the segment locks to the dominant axis

#### Scenario: Smooth all

- **WHEN** the user draws a three-click polyline and activates Smooth all
- **THEN** every anchor carries both handles and the preview renders as a flowing curve

### Requirement: Pen stroke width and fill

The pen SHALL stamp its stroke with the pencil's circle tip of the configured width (1–16 cells):
a width-1 pen curve is exactly the Bresenham center line of the path. A closed path SHALL fill
its interior when the ShapePaint fill is on, painted under the stroke color like the shape tools.

#### Scenario: Width matches the pencil

- **WHEN** the user draws a straight pen segment at width 3
- **THEN** its cells equal a size-3 circle-brush pencil stroke along the same line
