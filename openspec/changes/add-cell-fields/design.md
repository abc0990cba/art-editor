# Design: add-cell-fields

## Context

`effects/jitter.ts` is the precedent for per-cell deterministic variation: `jitterAt(style, i,
stride)` reads a smooth value-noise lattice keyed by buffer position and returns `{size,
angle}`, consumed inside `shapeGeometry`'s `pushCell` and `gridPixels`. Fields generalize this
from noise to positional kinds.

## Decisions

### Data model: `FieldSettings` in `core/field.ts`

```ts
interface FieldSettings {
  size: 'none' | 'funnel' | 'fountain' | 'dome' | 'edges' | 'rampX' | 'rampY' | 'rampDiag'
      | 'waveX' | 'waveY' | 'rings' | 'spiral' | 'checker'
  align: 'none' | 'center' | 'outward' | 'swirl' | 'truchet' | 'wave'
  offset: 'none' | 'vortex' | 'magnet' | 'drift' | 'scatter'
  amount: number   // 0..1 size strength
  min: number      // 0.05..1 figure floor at the field low end
  angle: number    // 0..359 direction for ramps/waves/drift
  period: number   // 2..64 cells wavelength
  phase: number    // 0..359
  seed: number     // 1..9999 (truchet / scatter)
  invert: boolean
}
```

On `PixelStyle` like `inlay` (element freeze + preset snapshots flow free). `normalizeField`
+ `sameField` mirror the inlay module. Default: all kinds `'none'` (plain documents keep
byte-identical rendering).

### Pure evaluators in `effects/fields.ts`

`fieldAt(field, x, y, w, h): {scale, angle, dx, dy}` — one call per cell, x/y/w/h in buffer
cells (square path) or grid cells (non-square path); both normalize to 0..1 so the same field
reads the same on every lattice:

- field value t ∈ [0,1] per kind; `invert` flips; `scale = min + (1-min) * (1 - amount +
  amount·t)` — amount 0 collapses to the unfaded figure.
- radial kinds use Chebyshev-normalized distance from the rect center; spiral adds
  atan2-based angle; checker steps by `period`.
- align: center/outward/swirl derive `atan2` from the cell to the center (degrees, added to
  the base rotation); truchet = `⌊hash(seed, x, y)·4⌋·90`; wave = `amount·45·sin(...)` —
  align returns degrees 0..360.
- offset: magnitude ≤ `0.5·(1-scale)`, floored at a quarter cell so full-size figures can
  still drift (same-color overlap is a harmless path union); vortex/magnet use the radial
  direction, drift walks the `angle` direction with a sine envelope, scatter uses two seeded
  hashes.

### Consumption and gates

`pushCell` composes after jitter: `scale = shrink · fieldScale`, rotation `base + jitterAngle
+ fieldAngle`, box shifted by `(dx·w, dy·h)`. `gridCellFragment` does the same from grid-cell
coordinates. Gates:

- `runMerge` additionally requires all three kinds `'none'` (any field breaks rect runs).
- `plainSquare` requires `align === 'none' && offset === 'none'` — a size-only field keeps
  the figure a rect (roundedRectPath shrinks about the center), rotated/shifted ones do not.
- `textured` additionally requires `size === 'none'` (specks would escape shrunk figures,
  same reason jitter excludes itself).
- `plainSquarePreviewStyle` (staging) mirrors the align/offset rule — fields land on commit
  (plain-until-release, like jitter, which staged previews already omit).

Deterministic per cell → the dirty-tile cache stays valid.

### Plumbing

`sameField` into `samePixelStyle`/`stylesEqual`; ten key entries into `elementStyleKey`;
`normalizeField` into `normalizeStyle`/`normalizePresetConfig`; a dedicated `style.field`
node (kinds + knobs) writing `style.field`; UI group `FieldSection` in the pixels block
(kind chip grids per modulator + shared sliders, shown when any kind is active or the group
is toggled); i18n `style.field.*` en+ru; built-in seeds: Funnel, Vortex, Ripple (rings),
Sunray (spiral), Truchet Weave, Tides (waveX + drift).

## Risks / Trade-offs

- One extra evaluation per cell when any field is active — the same cost class as jitter;
  `none` docs pay one boolean per builder call.
- Fields are evaluated in buffer cells on the square grid (sub-cells included) — sub-detail
  docs show the field at sub-cell granularity, which matches how jitter already behaves.
- Align/offset on `square` figures forces the generic fragment path (rounded polygon instead
  of run rects) — expected, it is the same trade the angle spread already makes.
