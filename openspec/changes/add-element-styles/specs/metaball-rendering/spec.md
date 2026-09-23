# metaball-rendering — Delta

## MODIFIED Requirements

### Requirement: Merge mode (field per style group)

In `element` scope, metaball fields SHALL be computed per style group — the merge of cells whose frozen element styles are equal — instead of one canvas-wide field. Within a style group the existing rules hold: per-color isolation by default or one merged field, kernel radius from that group's strength, quality and border behavior from that group's settings. Connectors participate in the field of the element they were drawn with. Cells whose element attribution is missing (legacy or corrupt data) SHALL render as one bottom-most group using the document-level style, so they never disappear.

#### Scenario: Different strengths do not bleed

- **WHEN** the user draws a blob with metaball strength 80, then sets strength 20 and draws a second blob overlapping the first
- **THEN** each blob keeps its own contour computed at its own strength; the overlap area shows both fields rendered independently.

#### Scenario: Global scope unchanged

- **WHEN** the scope is `global`
- **THEN** metaball fields are computed exactly as before per-element styles existed (one field over all cells with the document settings).

### Requirement: Shared geometry pipeline (element scope)

Element-scope metaball contours SHALL come from the same `buildGeometry` engine as SVG/PNG export: the exported SVG paths SHALL match the per-element shapes visible in the viewport.
