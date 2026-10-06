# Tasks: add-glyph-inlays

## 1. Engine

- [x] 1.1 `glyph/emoji-sample.ts`: `sampleGlyph` (canvas fillText → threshold → res² bitmap,
      LRU, node fallback) + tests
- [x] 1.2 `core/inlay.ts`: `source`/`glyph`/`resolution`/`dotShape`/`dotScale` fields in
      normalize + equality
- [x] 1.3 `geometry/inlay.ts`: glyph branch of `inlayFragment` (dot matrix inside the box)
- [x] 1.4 `presets/index.ts` + `project-parse.ts`: clamps flow through (no new call sites —
      verify round-trip)

## 2. UI, i18n, nodes, presets

- [x] 2.1 `inlay-section.component.tsx`: source toggle + glyph controls (char field,
      resolution, dot shape, dot scale)
- [x] 2.2 i18n keys en + ru
- [x] 2.3 `nodes/styles.node.ts`: `inlaySource`/`inlayGlyph`/`inlayResolution` params
- [x] 2.4 Built-in seed "Emoji" in `presets/lists-forms.ts`

## 3. Tests & checks

- [x] 3.1 Fragment tests: dot matrix inside the box, follows scale/rotation; normalize
      round-trip; fast path unchanged
- [x] 3.2 Full chain green; PERFLOG row if measurable
