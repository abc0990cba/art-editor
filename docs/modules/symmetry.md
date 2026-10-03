# Symmetry — technical notes

## Scope

Point/rotational symmetry for every drawing tool: finite modes (mirrorX, mirrorY, quad, diag8,
radial N, kaleidoscope) and repeat modes (the 17 classical wallpaper groups + hex/diagonal p1
variants + brick/halfdrop tilings). All files live in [`src/engine/effects/`](../../src/engine/effects/symmetry.ts):
[`symmetry.ts`](../../src/engine/effects/symmetry.ts) (facade + orbit),
[`symmetry-radial.ts`](../../src/engine/effects/symmetry-radial.ts) (radial opts, wedge gate, budget
constants), [`symmetry-repeat.ts`](../../src/engine/effects/symmetry-repeat.ts) (wallpaper algebra).
The persisted settings live in `SymmetryState` (`mode`, `n`, `cell`, `showGuides`, `fill`, `phase`,
`twist`) in [`src/engine/core/doc.ts`](../../src/engine/core/doc.ts); the modes re-exported here are
that state's `mode` union.

## Module map

| File | Role |
|---|---|
| [`src/engine/effects/symmetry.ts`](../../src/engine/effects/symmetry.ts) | `symmetryPoints(…, limit)` orbit expansion, `symmetryTransforms` per-copy maps, `polarAngleMaps` (non-square lattices), `symmetryPairPoints` (connectors), `clampCell` |
| [`src/engine/effects/symmetry-radial.ts`](../../src/engine/effects/symmetry-radial.ts) | `RadialOpts { fill, phase, twist }`, `foldCount`/`fillFrac`/`phaseRad`/`twistRad`, wedge gates `inFilledWedge`/`angleInFilledWedge`, constants `MAX_ORBIT = 4096` |
| [`src/engine/effects/symmetry-repeat.ts`](../../src/engine/effects/symmetry-repeat.ts) | wallpaper/tiling lattice algebra: `WALLPAPER_MODES`, `TILING_MODES`, `REPEAT_MODES`, `repeatDef`, `Op { m, f }`, `repeatPoints` |

Tests: [`symmetry.test.ts`](../../src/engine/effects/symmetry.test.ts); bench
[`src/engine/paint/tools.bench.ts`](../../src/engine/paint/tools.bench.ts) (`symmetryPoints` ×2000).

## How it works

Two application paths, chosen by the caller:

1. **Per-point orbit expansion** — `symmetryPoints(x, y, bw, bh, mode, n, cell, radial?, limit)`
   returns the unique in-bounds copies of one point (original first; an empty list when the radial
   sector gate rejects the point). Painters stamp the tip at every returned point. Repeat modes
   inverse-map the point into lattice-fractional coordinates (`repeatPoints`), enumerate lattice
   translations over the canvas-corner bbox, and apply the group's point operations
   (`Op { m: [4], f: [2] }` matrix + flip); `centering` (cm/cmm) doubles copies.
2. **Whole-copy transforms** — `symmetryTransforms(bw, bh, mode, n, radial)` returns affine
   `SymTransform` point-maps for *shapes*: "Shapes map their defining points through each transform
   and re-rasterize, so every copy is a correctly drawn shape instead of a mirrored raster. Returns
   null for `none` and repeat/wallpaper modes — those have no per-copy endpoint map" and keep
   per-point expansion. Radial/kaleido include the k=0 identity; mirror modes don't.

Mode specifics:

- **Radial/kaleido** (`symmetry.ts` + [`symmetry-radial.ts`](../../src/engine/effects/symmetry-radial.ts)):
  support a filled-wedge gate (`fill` 0–100 of the sector, `inFilledWedge`), `phase` rotation and
  `twist` (degrees per unit radius, −45..45, applied before the fold rotations); points outside the
  filled wedge are rejected before any copies are made. Kaleido = radial fold + one mirrored source
  `[-dx, dy]` (mirroring across *vertical*, consistent with y-down canvas coordinates and
  `polarAngleMaps`). `foldCount(n) = max(2, round(n))` clamps degenerate counts.
- **Non-square lattices**: the staging hook maps angles instead of buffer coordinates —
  `polarAngleMaps(mode, n, radial)` produces θ-transforms (mirrorX θ→π−θ etc.) and each mapped angle
  resolves through `grid.radiusOf`/`angleOf`/`cellByAngle` to the nearest lattice cell (−1 when
  none). The polar variant of the wedge gate is `angleInFilledWedge`.
- **Connectors** use `symmetryPairPoints` — both endpoints mapped by the same group operation so
  mirrored/rotated links stay connected; the repeat path caps at 256 link copies.

## Data structures

- `RadialOpts { fill?, phase?, twist? }` — rosette drawing knobs; all three default off
  (`fillFrac`/`phaseRad`/`twistRad` normalize them to fractions/radians).
- `SymTransform = (x, y) => [x, y]` — the per-copy point map returned by `symmetryTransforms`.
- `RepeatDef` ([`symmetry-repeat.ts`](../../src/engine/effects/symmetry-repeat.ts)) — the algebra of
  one repeat mode: lattice basis vectors `A`/`B` in cell-size units (square, hex `B = [0.5, √3/2]`,
  diagonal `±[√2/2, √2/2]`), the point group `ops: Op[]` (identity included), an optional
  `centering` fractional translation (cm/cmm) and `mirrors` directions. `Op { m: [4], f: [2] }` is
  one operation in lattice-fractional coordinates: `(u, v) → (m0·u + m1·v + f0, m2·u + m3·v + f1)`.
- `repeatPoints(x, y, bw, bh, def, c, seen, push, limit)` inverse-maps the point through the basis
  inverse, enumerates integer translations over the canvas-corner bbox per operation (×2 copies when
  centered), and `push`es each unique in-bounds cell — bailing at `limit` (default `MAX_ORBIT`).

## The orbit budget (PERFLOG M4 — not a cache)

`symmetryPoints(…, limit)` **short-circuits** the lattice enumeration at the budget instead of
materializing a 4096-point orbit and slicing it: wallpaper orbits ×2000 calls went from 393.8 ms to
6.4 ms (−98 %, [PERFLOG](../../bench/PERFLOG.md) 2026-09-26, M4a). Call sites compute
`cap = max(64, floor(MAX_STAMPS / tipOffsets.length))` with `MAX_STAMPS = 20_000`
([`features/canvas/canvas-stage.util.ts`](../../src/features/canvas/canvas-stage.util.ts), applied in
[`use-canvas-staging.hook.ts`](../../src/features/canvas/use-canvas-staging.hook.ts)). The separately
cached thing is `blobCells` (brush blobs for non-square grids) keyed by (grid, anchor, count), cap
1024 — it lives in `features/canvas/canvas-stage.util.ts`, not in the engine.

## Invariants & constraints

- `MAX_ORBIT = 4096` (safety cap on a single repeat orbit, [`symmetry-radial.ts`](../../src/engine/effects/symmetry-radial.ts));
  `clampCell` bounds repeat cell size to `MIN_CELL = 4`..`MAX_CELL = 64` px.
- Orbit output is de-duplicated, in-bounds only, original first — callers rely on it.
- Repeat modes never return transforms (`symmetryTransforms` → `null`); finite modes never enumerate
  translations.
- `foldCount(n) = max(2, round(n))` — degenerate radial counts clamp to 2.

## Performance characteristics

- Orbit short-circuit: see numbers above; [`tools.bench.ts`](../../src/engine/paint/tools.bench.ts)
  benches `symmetryPoints` ×2000 (mirrorX/quad/diag8, p4 without and with the stamp limit).
- `MAX_STAMPS` bounds the worst-case stamp count per frame (orbit × tip size), keeping the staging
  frame bounded regardless of mode.

## Testing

[`symmetry.test.ts`](../../src/engine/effects/symmetry.test.ts) pins, per its `describe` blocks:
`symmetryPoints` (finite modes), repeat modes (wallpaper/tiling algebra through `repeatPoints`),
`polarAngleMaps` (non-square lattices), `symmetryTransforms` (per-copy endpoint maps),
`symmetryPairPoints` (connector copies) and radial fill/phase/twist gating. Stamping integration is
exercised in [`tools.bench.ts`](../../src/engine/paint/tools.bench.ts) and the staging hook.

## Related decisions

- [shapes](shapes.md) — why shapes re-rasterize per copy.
- [canvas-stage](canvas-stage.md) — stamp caps at the call site.

## OpenSpec capabilities

- `openspec/specs/symmetry/spec.md`

## Known limitations

- Guide overlays (axes/spokes) are drawn by the stage, not derived here.
- Radial twist is linear in radius; no elliptical/repeat-twist variants.
