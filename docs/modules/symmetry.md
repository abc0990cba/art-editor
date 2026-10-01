# Symmetry — technical notes

## Scope

Point/rotational symmetry for every drawing tool: finite modes (mirrorX, mirrorY, quad,
diag8, radial N, kaleidoscope) and repeat modes (17 classical wallpaper groups + hex/diagonal
p1 variants + brick/halfdrop tilings). Files: `src/engine/symmetry.ts` (facade, orbit),
`symmetry-radial.ts` (radial opts + budget), `symmetry-repeat.ts` (wallpaper algebra).

## Module map

| File | Role |
|---|---|
| `src/engine/symmetry.ts` | `symmetryPoints(…, limit)`, `symmetryTransforms`, `polarAngleMaps`, `symmetryPairPoints` (connectors) |
| `src/engine/symmetry-radial.ts` | `RadialOpts { fill, phase, twist }`, filled-wedge gating, `MAX_ORBIT = 4096` |
| `src/engine/symmetry-repeat.ts` | wallpaper/tiling lattice algebra (`Op { m, f }`), `repeatPoints` |

## How it works

Two application paths, chosen by the caller:

1. **Per-point orbit expansion** — `symmetryPoints(x, y, bw, bh, mode, n, cell, radial?,
   limit)` returns the unique in-bounds copies of one point (original first). Painters stamp
   the tip at every returned point. Repeat modes inverse-map the point into lattice-fractional
   coordinates, enumerate lattice translations over the canvas-corner bbox, and apply the
   group's point operations (`Op { m: [4], f: [2] }` matrix + flip); `centering` (cm/cmm)
   doubles copies.
2. **Whole-copy transforms** — `symmetryTransforms(bw, bh, mode, n, radial)` returns affine
   copies for *shapes*: "Shapes map their defining points through each transform and
   re-rasterize, so every copy is a correctly drawn shape instead of a mirrored raster.
   Returns null for `none` and repeat/wallpaper modes — those have no per-copy endpoint map"
   and keep per-point expansion. Radial/kaleido include the k=0 identity; mirror modes don't.

Radial modes support a filled-wedge gate (`fill` 0–100 of the sector), `phase`, and `twist`
(degrees per unit radius, −45..45); points outside the filled wedge are rejected. Kaleido =
radial fold + one mirrored source `[-dx, dy]` (mirroring across *vertical*, consistent with
y-down canvas coordinates and `polarAngleMaps`).

For non-square lattices, the staging hook maps angles instead of buffer coordinates:
`polarAngleMaps` produces θ-transforms (mirrorX θ→π−θ etc.) and each mapped angle resolves
through `grid.radiusOf`/`angleOf`/`cellByAngle` to the nearest lattice cell (−1 when none).

**Connectors** use `symmetryPairPoints` — both endpoints mapped by the same group operation;
the repeat path caps at 256 link copies.

## The orbit budget (PERFLOG M4 — not a cache)

`symmetryPoints(…, limit)` **short-circuits** the lattice enumeration at the budget instead
of materializing a 4096-point orbit and slicing it: wallpaper orbits ×2000 calls went from
393.8 ms to 6.4 ms (−98 %, PERFLOG 2026-09-26). Call sites compute
`cap = max(64, floor(MAX_STAMPS / tipOffsets.length))` with `MAX_STAMPS = 20_000`
(`canvas-stage.util.ts`). The separately cached thing is `blobCells` (brush blobs for
non-square grids) keyed by (grid, anchor, count), cap 1024 — it lives in
`features/canvas/canvas-stage.util.ts`, not in the engine.

## Invariants & constraints

- `MAX_ORBIT = 4096`; `clampCell` bounds repeat cell size to 4..64 px.
- Orbit output is de-duplicated, in-bounds only, original first — callers rely on it.
- Repeat modes never return transforms; finite modes never enumerate translations.
- `foldCount(n) = max(2, round(n))` — degenerate radial counts clamp to 2.

## Performance characteristics

- Orbit short-circuit: see numbers above; `tools.bench.ts` benches `symmetryPoints` ×2000.
- `MAX_STAMPS` bounds the worst-case stamp count per frame (orbit × tip size), keeping the
  staging frame bounded regardless of mode.

## Testing

Pinned via `symmetry` unit tests and staging integration in `tools.bench.ts`; wallpaper
group coverage exercised through `repeatPoints` algebra tests (see `symmetry-repeat.ts`).

## Related decisions

- [shapes](shapes.md) — why shapes re-rasterize per copy.
- [canvas-stage](canvas-stage.md) — stamp caps at the call site.

## OpenSpec capabilities

- `openspec/specs/symmetry/spec.md`

## Known limitations

- Guide overlays (axes/spokes) are drawn by the stage, not derived here.
- Radial twist is linear in radius; no elliptical/repeat-twist variants.
