# ADR-0005 — Single zustand store, sliced, with zundo history

- Status: accepted
- Date: 2026-10-01 (store in place since `add-editor-core`; slice split per the ratchet program)
- Related: [state-store](../modules/state-store.md); [data-model](../architecture/data-model.md); [`src/state/editor.store.ts`](../../src/state/editor.store.ts)

## Context

The editor needs one coherent application state: the document, tool options, selection,
library bindings, UI prefs — plus undo/redo over document changes only, and cross-slice
reactions (autosave, history budget, theme mirror). React state was too distributed for
cross-feature actions; the document is large and must not be cloned per keystroke of unrelated
UI state.

## Decision

One zustand store ([`src/state/editor.store.ts`](../../src/state/editor.store.ts)), composed from **16 vertical slices** (`ui`,
`tools`, `doc`, `style`, `paint`, `fill`, `selection`, `transform`, `effect`, `glyph`,
`gradient`, `vector`, `vector-presets`, `presets`, `brushes`, `project`), each owning its
initial state and actions behind the same `SliceApi { set, get }`. Undo/redo is zundo
`temporal` middleware with `partialize: (s) => ({ doc: s.doc })`: only the document is in
history scope; restore is a whole-`Doc` replacement (root-shaped partialize), throttled 350 ms
trailing so slider drags collapse into one entry. The history step limit is dynamic —
`max(2, min(100, floor(256 MB / doc bytes)))` recomputed on every doc change — because undo
entries hold whole cell buffers.

Cross-slice behavior is implemented as module-level `subscribe` effects in
`store.effects.ts` (registration order: history budget → theme mirror → autosave → dirty
flag). There is no action bus: features call store actions directly; effects react to state
deltas.

## Alternatives considered

- **Multiple stores per feature** — rejected: document actions inherently span slices
  (paint touches `doc`, `selection`, `project` dirty state); cross-store orchestration would
  need another layer anyway.
- **Redux / Redux Toolkit** — rejected: action/type ceremony for a single-writer app;
  zustand's selector subscriptions plus vanilla `subscribe` cover the same needs with far
  less code.
- **React context + reducer** — rejected: re-render cost of holding the document in context
  and no temporal middleware; undo would be hand-rolled.
- **Structural/patch-based undo** — deferred: the tile-model work (PERFLOG P1) introduces
  region patches; until then, whole-doc restore (100–154 ms at 4096²) is the accepted cost,
  bounded by the dynamic history budget.

## Consequences

- Every slice is testable in isolation (plain `set/get` functions); `engine/*.test.ts`
  integration tests lift the whole store.
- History memory is bounded but proportional to doc size — the `syncHistoryLimit` effect is
  load-bearing; undo at 4096² restores a ~96 MB buffer pair, which is why patch-undo is on
  the roadmap.
- Selection/active-layer ids live outside history, so `repairDocRefs` must run after every
  restore/load to filter dangling ids.
- Vector/gradient sessions deliberately sit **outside** undo history (their slices are not
  in `partialize`) — tracing is exploratory and entries autosave separately.

## Evidence

- [`src/state/editor.store.ts`](../../src/state/editor.store.ts) — composition, `temporalOptions`, `window.__store` dev hook.
- [`src/state/store.effects.ts`](../../src/state/store.effects.ts) — the four subscription effects and the 256 MB budget
  formula (the "~32 MB" figure in an older store comment is stale).
- [`src/state/store-internals.util.ts`](../../src/state/store-internals.util.ts) — `commitStroke` contract (one stroke = one object,
  auto-attached offset node, `pruneEmptyObjs` + `syncDoc`).
