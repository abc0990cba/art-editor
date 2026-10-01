# Effects — technical notes

## Scope

Selection-scoped destructive effects: displacement warps (`warp.ts`), stylize post-ops
(`stylize.ts`), and geometric selection transforms (`selection-xform.ts`). All operate on
sparse ink maps over the **square grid only**, all bake through the same nearest-neighbor
remap, and all are one undoable commit via the `effect`/`transform` slices
([state-store](state-store.md)). The non-destructive alternative for procedural objects is
the `mod.warp` *node* ([node-graph](node-graph.md)).

## Module map

| File | Role |
|---|---|
| `src/engine/selection-xform.ts` | scale / rotate / flip as inverse-sampling cell remaps |
| `src/engine/warp.ts` | bulge, fisheye, twirl, waveH/V, zigzag, polar/unpolar, roughen |
| `src/engine/stylize.ts` | outline, drop shadow, dithered glow — returns only ADDED cells |

## How it works

**Transforms** (header): "Selection transforms (scale / rotate / flip) as nearest-neighbor
cell remapping… The mapping is inverse-sampling: every target cell in the transformed bounding
region asks 'which source cell owns my center?' — so upscaling fills solid instead of
scattering holes." Scale anchors at the drag corner (`ax, ay`); rotate/flip pivot on the box
center; flip is its own inverse. No interpolation anywhere — this is pixel art.

**Warps** (header): "Pure buffer math over sparse ink maps — the same inverse-sampling
contract… `roughen` is the one forward op." Fields are continuous functions evaluated per
target-cell center — no field grid/discretization; only the *target region* is grown by the
max displacement so effects don't clip themselves. Exact mappings: bulge = power-law radial
scale (`e = 1+k`); fisheye = radius divided by `1+f(1−t)²`; twirl = rotation `a = k·2π(1−t)²`;
waves subtract `amp·sin(2π·coord/wl)`; zigzag is the radial ripple; `polar` is implemented as
the *inverse* of polar→rect (rect↔polar round-trip pairs). `roughen` scatters boundary cells
(any empty 4-neighbour) by hash-seeded jitter — collisions overwrite, which is the point.

**Stylize** (header): "Every function takes the selection's ink snapshot and returns only the
ADDED cells — the caller merges them over the source and bakes through the usual selection
path. All ops are deterministic: the glow's density falloff is an ordered Bayer screen, not
randomness." Outline = 8-neighbour 1-cell ring that never overwrites ink; shadow = offset copy
minus source; glow = BFS frontier tracking Chebyshev rings, keeping ring *k* where
`thresholdAt(BAYER8, 8, 64, x, y) < 1 − k/(radius+1)` — a Bayer-dot fade that introduces no
new palette colors.

## Data structures

- `SelectionXform` — discriminated union (scale/rotate/flip); `CellBox` is half-open
  `[x0, x1)`.
- Ink maps: `Map<index, InkCell { v, o }>` (value + element attribution) — the same sparse
  representation scene objects use, so graph-driven objects can be baked and remapped
  uniformly.
- `WarpParams { amount −100..100, radiusPct 10..200, wavelength 2..256, seed }`;
  `strength = clamp(amount/100, −0.9, 1)` (never fully inverts).

## Invariants & constraints

- Square grid only — enforced at the slice/UI level; non-square docs don't offer the ops.
- Procedural (graph-driven) objects **freeze into plain cells** when baked
  (`effect.slice.ts` header) — documented UX trade-off, undoable.
- Determinism: glow's Bayer screen and `roughen`'s `hash2` jitter are stable across runs;
  no `Math.random` anywhere.

## Performance characteristics

All three are O(target region) nearest-neighbor passes with no allocations in the inner loop
beyond the output map; the expensive part in practice is the subsequent composite + geometry
rebuild (see [render-pipeline](../architecture/render-pipeline.md)). Not separately benched —
region sizes are selection-sized, not canvas-sized.

## Testing

Pinned by engine tests for warp/stylize/transform math (determinism, region growth, add-only
contract) and slice-level integration in `state/` tests.

## Related decisions

- [node-graph](node-graph.md) — the non-destructive `mod.warp` path.

## OpenSpec capabilities

- `openspec/specs/drawing-tools/spec.md` (selection effects)

## Known limitations

- No non-destructive selection effects (bake-only, undoable).
- No interpolation/sub-cell precision on rotate — nearest-neighbor by design.
- Stylize ops add no new colors (glow reuses the source color); no "outer glow in second
  color" variant.
