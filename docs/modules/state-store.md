# State store — technical notes

## Scope

`src/state/`: the single zustand store, its 16 slices, the zundo undo wiring and the
module-level subscription effects. Architecture rationale: [ADR-0005](../decisions/0005-zustand-single-store.md);
data-model context: [data-model](../architecture/data-model.md).

## Module map

| File | Role |
|---|---|
| [`src/state/editor.store.ts`](../../src/state/editor.store.ts) | composition, `State` type, `temporalOptions`, undo/redo helpers, `window.__store` (dev) |
| [`src/state/store.effects.ts`](../../src/state/store.effects.ts) | subscription effects: history budget, theme mirror, autosave, dirty flag, `repairDocRefs` |
| [`src/state/store-internals.util.ts`](../../src/state/store-internals.util.ts) | `commitStroke`, `resolveElement`, `genNodeId`, `offsetGraphNodes`, `linkKey`, `activeLayerOf` |
| [`src/state/doc.slice.ts`](../../src/state/doc.slice.ts) | doc state + scene-tree structure actions; boot restore from the localStorage mirror |
| [`src/state/paint.slice.ts`](../../src/state/paint.slice.ts) | `paintCells`/`paintCellsValues` — one stroke = one object on the active layer |
| `src/state/{ui,tools,style,fill,selection,transform,effect,glyph,gradient,vector,vector-presets,presets,brushes,project}.slice.ts` | the other 14 slices |

## How it works

**Composition**: every slice is `createXSlice({ set, get })` returning its state + actions;
the store spreads all 16 and wraps with zundo `temporal`:

```
create<State>()(temporal((set, get) => ({ ...ui, ...tools, ...doc, ... }), temporalOptions))
```

then `setupStoreEffects(useStore, temporalOptions)` wires the cross-slice reactions. There is
no action bus — features call actions directly; effects subscribe to state deltas.

**Slice responsibilities (one line each)**:

| Slice | Owns |
|---|---|
| `ui` | theme, lang, rail/panel toggles, grid overlay, recent colors, node-editor mode/split, export size |
| `tools` | active tool + per-tool options, brush + snap, fill style, import layering |
| `doc` | the `Doc`, active layer; resize/grid/sub, load/new/import, scene-tree structure (add/rename/reorder/group/setObjectGraph) |
| `style` | canvas-wide style/metaball/texture patches, bg, style scope |
| `paint` | cell/link commits: paint entries join a fresh object, erases steal cells back on the active layer |
| `fill` | region fill with element-scope attribution |
| `selection` | selected element ids, select-all/marquee, restyle/delete |
| `transform` | scale/rotate/flip/duplicate via nearest-neighbor remap (procedural objects bake) |
| `effect` | warps + stylize ops (same bake contract) |
| `glyph` | glyph-set library + draft editor state |
| `vector` / `gradient` | runtime hosts of open trace/gradient sessions (outside undo) |
| `vector-presets` / `presets` / `brushes` | user libraries |
| `project` | bound library entry, name, dirty flag, `saveToLibrary`, rename sync (400 ms) |

**Undo history** (zundo): `partialize: (s) => ({ doc: s.doc })` — the partialized value must
itself be root-shaped "so zundo restores via setState() merge". Trailing throttle 350 ms
("slider drags collapse into one history entry"). Restore is a whole-`Doc` replacement; the
step limit is *dynamic*: `syncHistoryLimit` recomputes
`max(2, min(100, floor(256_000_000 / bytes)))` on every doc change, where
`bytes = cells·(2 + (cellObj ? 4 : 0)) + ink·24` — undo entries hold whole cell buffers, so
history memory is bounded proportionally to the document. (An older comment says "~32 MB /
min 8" — stale; the code enforces 256 MB / min 2 / max 100.)

**Repair after restore**: selection ids and `activeLayerId` live outside history, so
`repairDocRefs` filters them against the restored doc after every undo/redo/load
("undo/redo/load can resurrect docs where selected elements or the active layer no longer
exist").

**Commit contract** (`store-internals.util.ts`): `commitStroke` rejects hidden/locked layers,
gives every drawn object an auto-attached offset node (`offsetGraphNodes` — the position node
editable in the node editor), then `pruneEmptyObjs` + `syncDoc`. `commitStrokeParametric`
regenerates ink from node parameters ("geometry edits in the node editor move the shape on
the canvas").

## Store effects (registration order)

1. `syncHistoryLimit` — above; mutates `temporalOptions.limit` (zundo reads it per push).
2. Theme mirror — `document.documentElement.dataset['theme']` + `prefers-color-scheme`
   listener for `auto`.
3. **Autosave** — if `doc !== savedDoc`: serialize → localStorage mirror (`glyph.doc`, only if
   ≤ 2 M chars — "storage full: the library entry still gets the document") →
   `saveToLibrary()`; debounce 2000 ms trailing; immediate flush on
   `pagehide`/`visibilitychange`. Unbound work gets a fresh entry on first flush.
4. Dirty flag — `projectDirty` when the doc differs from `savedDoc`.

## Invariants & constraints

- Only `doc` is in undo scope; vector/gradient/brush/library state is deliberately not
  undoable.
- Slices must not import features or storage views (dependency-cruiser `state-no-ui`);
  `storage` imports are allowed for persistence calls.
- The live `DOC_KEY` localStorage constant is owned by `doc.slice.ts`; `storage/migrate.ts`
  keeps its own copy documented at the boundary ("storage must not import from the state
  layer").

## Performance characteristics

- Undo = full-document restore: 100–154 ms at 4096² plus one buffer pair pinned per step —
  patch-undo is part of the tile project (`docs/research/performance.md` §7, roadmap P1).
- History budget math above bounds worst-case memory to ~256 MB regardless of canvas size.
- Autosave encode ≈ 1.7 ms at 2048² scene (`persistence.bench.ts`); stringify + thumbnail
  are the off-thread candidates (research W1).

## Testing

Slices are exercised by engine integration tests (the `engine/*.test.ts` store exception) and
`persistence` flows; the autosave/history behavior is covered in state tests and the
`projects` storage tests.

## Related decisions

- [ADR-0005](../decisions/0005-zustand-single-store.md) (this file is its consequence map);
  [ADR-0006](../decisions/0006-indexeddb-persistence.md) (autosave targets).

## OpenSpec capabilities

- `openspec/specs/persistence/spec.md` (autosave semantics); editor-presets change touches
  `presets` slice.

## Known limitations

- Whole-doc undo (no patches yet); selection/active layer repaired, not restored.
- No per-slice action logging/devtools middleware beyond `window.__store`.
