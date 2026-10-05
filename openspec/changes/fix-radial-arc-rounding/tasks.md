# Tasks: fix-radial-arc-rounding

## 1. Engine

- [x] 1.1 `grids/builders.ts` (`makeRadial`): adaptive arc sampling — per-interval chord
      count `max(4, ceil(interval / 8°))`, a pure function of the interval so shared arc
      pieces keep identical vertices across ring boundaries
- [x] 1.2 `geometry/poly-path.ts`: relax the `corners < 3` degenerate guards in `filletPath`
      and `minCornerRun` to `corners < 1` (one- and two-corner loops round; corner-free
      loops keep the plain-polygon fallback)
- [x] 1.3 `geometry/metaball-field.ts` + `grids/geometry.ts`: optional doc-unit `clip`
      predicate on `buildMetaballField`; radial passes the disc clamp (`r ≤ rows`)

## 2. Tests

- [x] 2.1 `grids/geometry.test.ts`: coarse uniform sectors (cols 4/6/8) outline fillet
      counts, even-graded per-ring outline smoothness (incl. the ring-0 half disc), ring-0
      union corner-free disc, pixels rounding on every even ring, metaball adjacency merges
      (square + radial controls with true sector offsets), half-disc pair merge, disc clamp
- [x] 2.2 `geometry/poly-path.test.ts`: two-corner loop rounding (shallow tangency + deep
      runPoint counts), `minCornerRun` merged diameter on the half disc, corner-free fallback
      fixture (sampled circle)
- [x] 2.3 Existing suites green unmodified (square-grid byte compatibility)

## 3. Docs & polish

- [x] 3.1 `docs/modules/grids.md`: adaptive radial arc sampling note, metaball disc clamp
- [x] 3.2 `docs/modules/geometry.md`: two-corner loop semantics in the fillet core, metaball
      `clip` option
- [x] 3.3 Full check chain green (format/lint/arch/knip/tsc/test); rendered sanity check of
      coarse + even radial docs in outline/metaball/pixels modes
