# Delta: scene-tree — merge same colors

## ADDED Requirements

### Requirement: Merge same colors unites per-color blocks

The layers panel SHALL provide a «Merge same colors» action that, within each layer, unites all
mergeable objects holding the same palette value into one object per color. An object is
mergeable when it has no live node graph, no connectors, is unlocked, is visible through its
whole ancestor chain, and every cell of its ink carries one and the same palette value. Objects
failing any condition SHALL remain untouched. The merged object SHALL occupy the tree slot of
the bottom-most member, and the composite cells of the document SHALL be identical before and
after the merge.

#### Scenario: Dotted import collapses per color

- **WHEN** an import with «Object per region» produced one object per dot and the user runs
  «Merge same colors»
- **THEN** each layer holds one object per palette value, and the document's composite cells are
  byte-identical to before

#### Scenario: Untouchable objects stay as they are

- **WHEN** a layer mixes same-color dot objects with a multi-color drawing, a connector owner and
  a graph object
- **THEN** only the dot objects merge; the drawing, the connector owner and the graph object keep
  their ids, cells and position

### Requirement: Merge scope and selection

The action SHALL process only the selected objects when the selection contains objects, and the
whole document otherwise. After merging, the selection SHALL reference the merged objects
(selection ids whose objects were united map to the united object's id). The merge SHALL be one
undoable step.

#### Scenario: Selection-scoped merge

- **WHEN** the user selects three black dot objects and runs «Merge same colors»
- **THEN** only those three unite into one selected object; same-color dots outside the selection
  stay separate

#### Scenario: Undo restores the split

- **WHEN** the user runs «Merge same colors» and then undo
- **THEN** the previous objects, ids and selection return intact
