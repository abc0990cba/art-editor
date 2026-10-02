# Tasks: add-line-systems

## 1. Core

- [x] 1.1 `screen-lines.ts`: hatch line geometry (angle / spacing / phase / wave),
      `hatchFragments` clip-and-emit scanner, `stripPath` filled-outline emitter,
      `hatchDistance` analytic coverage, sample/line budgets
- [x] 1.2 `screen-lines.test.ts`: strip even-odd safety (single closed subpath), spacing and
      angle invariants, wave continuity, scanner clipping, `hatchDistance` monotonicity

## 2. Surfaces

- [x] 2.1 Texture `hatch` effect: `texture-hatch.ts` adapters, region + field dispatch,
      `doc.ts` effect/style types, `project-parse` + `presets` validation, style node option
- [x] 2.2 Texture panel: Hatch chip, `hatchStyle` chips (straight / cross), knob wiring
- [x] 2.3 `mod.hatch` node registered in the graph (tone-driven lines, cross, wave,
      fixed ink or source colors)

## 3. Tests and docs

- [x] 3.1 `texture-hatch.test.ts`: deterministic fragments, clipping, cross coverage,
      knob monotonicity (amount → width, ramp → gradient)
- [x] 3.2 `hatch.node.ts` covered in the node conformance tests (tone monotonicity,
      determinism, empty-input behavior)
- [x] 3.3 i18n (EN/RU): effect chip, style chips, generalized slider copy
- [x] 3.4 Bench: hatch fragment cost on a dense region vs halftone; PERFLOG row
- [x] 3.5 Full gate green
