# Tasks: add-dither-registry

## 1. Catalog

- [x] 1.1 `src/engine/dither-catalog.ts` — `ImportDither` union, `DitherFamily`,
      `DitherDef`, `DITHER_CATALOG`, `DITHER_FAMILIES`, `dithersOfFamily`,
      `ORDERED_DITHERS`
- [x] 1.2 Family dispatch registries: `SPECIAL_MAPPERS` in `import-special.ts`,
      `GLYPH_MAPPERS` in `import-glyph.ts`
- [x] 1.3 `ditherSample` dispatches on `DITHER_CATALOG[...].family`; unknown
      strategies fall back to nearest mapping
- [x] 1.4 `import-image.ts` re-exports `ImportDither` + `ORDERED_DITHERS` (public API
      unchanged for features/tests)
- [x] 1.5 `DITHER_GROUPS` in the import feature derived from the catalog

## 2. Regression

- [x] 2.1 Existing import tests pass unchanged (determinism, strength-0 ≡ nearest,
      palette bounds)
- [x] 2.2 Full gate green: format, lint, arch, knip, tsc, test
