# Tasks: add-halftone-screen-engine

## 1. Core

- [x] 1.1 `screen-engine.ts`: lattices (grid/hex/rings/sunburst/spiral/phyllotaxis/
      scatter), 10 marks, size/density/twist mappings, LatticeIndex, coverage tests
- [x] 1.2 `EvalContext.luma` service + `paletteLuma` helper plumbed through eval,
      scene, geometry, preview and benches

## 2. Surfaces

- [x] 2.1 Texture panel: halftone honors the speck shape; Lattice chips
      (engine `texture-lattices.ts`, `texture.htLattice` setting, presets field)
- [x] 2.2 Fill `screen` pattern: grid / hex / rings lattices + UI chips
- [x] 2.3 `mod.halftone` node registered in the graph
- [x] 2.4 Import dithers: `screen-45`, `screen-wave` (ordered) + `cmyk` (special)

## 3. Tests and docs

- [x] 3.1 `screen-engine.test.ts`: lattice invariants, mask monotonicity, silhouette
      scaling, node behavior, fill lattice monotonicity
- [x] 3.2 `texture-lattices.test.ts`: deterministic non-empty fragments, non-dot
      silhouettes
- [x] 3.3 Halftone dot pins updated for the explicit `dot` shape default
- [x] 3.4 i18n (EN/RU): texture lattices, fill lattice, three import dithers
- [x] 3.5 Full gate green
