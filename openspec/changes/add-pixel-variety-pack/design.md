# Design: add-pixel-variety-pack

## Context

`StyledPath` already carries `stroke`/`strokeWidth` and both renderers honor them
(`drawGeometry`, `buildSvg`) — connectors use strokes today. The form registry grows through
the standard five-point registration (union member + `CELL_SHAPES` row + `HIT_OF` + `FRAG_OF`
+ two i18n keys).

## Decisions

### Stroke block on `PixelStyle`

```ts
interface StrokeSettings {
  width: number       // 0..0.45 of the cell pitch, 0 = off
  colorMode: 'same' | 'darken' | 'lighten'
  depth: number       // 0..1 darken/lighten strength
  fill: boolean       // fill on top of the stroke (rim look) — default true
}
```

Emission: shape.ts and gridPixels push the same per-color path with
`stroke: resolvedColor`, `strokeWidth: width`, `fill: fill ? color : undefined`. The stroke
color derives per palette value through the inlay's shade helpers (darken/lighten reuse
`shadeHex`/`tintHex`; `same` = the cell color). Groups stay per value — one extra resolved
color at most. The inlay paints after and stays filled; texture holes keep punching the base
fill (visible only when fill is on — the plain-square texture gate is unchanged). Gates:
stroke never breaks run merging (same path data, only attributes change). stagedCellPath
gains matching stroke attributes via the staging preview group emission (paths get stroke
fields). `sameStroke`/normalize mirror the other blocks; `style.pixel` node gets
`strokeWidth`/`strokeMode`/`strokeFill` params.

### Seven forms

- `quadrant` — corner quarter disc; `arcFrame`-style frag (center at the unit corner (0,1),
  radius half the min box side), rotation via the frame; hit: `x² + (1−y)² ≤ 1`.
- `bowtie` — two triangle subpaths (evenodd union visually); no rounding (custom frag); hit:
  `y ≤ ½ ? (x ≥ y ∧ x ≤ 1−y) : (x ≥ 1−y ∧ x ≤ y)`.
- `hourglass` — mirror of bowtie on the vertical axis; hit swapped.
- `keyhole` — disc over wedge; frag: arc + two lines closed; hit: disc ∨ wedge bounds.
- `eye` — two arcs (lens, r = ½ of min side… chord 1 → r 0.5·s) + elliptical iris hole whose
  radius is `thickness·½·min(w,h)`; curved (radius knob dimmed); hit: lens inequality −
  `|y−½| ≤ h(x)` via the arc equation, hole punch is frag-only.
- `parallelogram` — unit poly `[(¼,0),(1,0),(¾,1),(0,1)]` through `polyFrag` (rounding
  applies); hit: band test `y − ¼ ≤ x ≤ y + ¼` (via linear edges).
- `waveStrip` — sine band: top edge sampled left→right, bottom mirrored back; `thickness` =
  band height fraction; sampled at 16 points per edge; hit: `|y−½| ≤ ¼+ampl·sin(2πx+…)` —
  hit test uses the same sampled envelope (half-band 0.25·thickness… 0.25 + 0.25·thickness).

`CELL_SHAPES` params: quadrant `['rotation'] curved`, bowtie/hourglass/parallelogram/waveStrip
`['thickness','rotation']` (parallelogram: thickness = skew), keyhole `['thickness','rotation']`,
eye `['thickness'] curved`. cell-shapes.test.ts iterates the registry automatically — new
forms must emit closed in-box fragments and satisfy the generic hit probes.

### Presets

`Blueprint` (hollow squares, blueprint blues), `Contour Dots` (hollow circles), `Waveband`,
`Keyholes`, `Eyes`, `Bowties` — `lists-forms.ts` rows.

## Risks / Trade-offs

- Stroked paths double paint cost per group when enabled (fill + stroke pass) — bounded and
  off by default.
- `bowtie`/`hourglass` skip corner rounding (self-intersecting polygon breaks the fillet
  walk) — their silhouettes are angular by design.
- Evenodd holes (eye iris) punch the fill AND the stroke rim visually crosses the hole —
  accepted, reads as an iris ring.
