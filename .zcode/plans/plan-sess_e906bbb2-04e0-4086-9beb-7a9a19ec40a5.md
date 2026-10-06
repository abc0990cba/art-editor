# Two fixes: color-picker brightness bar inversion + collapsible import galleries

## 1. Brightness bar picks the inverted color (bug)

`src/shared/ui/color-picker.component.tsx` — the HSV brightness bar renders its gradient white (left, value=1) → black (right, value=0), matching its tooltip "Brightness (value), from white to black", but `barPick` (line 183) maps the click position directly: `v = (clientX - r.left) / r.width`. Pressing the black right end yields v≈1 → white. That is exactly the reported "I press black, white is selected".

**Fix:** invert the fraction in `barPick`: `v = 1 - (clientX - r.left) / r.width` (still clamped to 0..1), plus a one-line comment stating the gradient-direction constraint. This one component is shared, so the fix applies everywhere it opens: Quick settings (fab panel), the settings-panel Color section, and the import palette editor.

## 2. Presets / Palette / Dithering in the import dialog → collapsible

The import dialog's right column (`src/features/import/import-dialog.component.tsx:198-302`) shows three always-expanded galleries: `ImportPresetsField` (2-col tile grid), `ImportPaletteField` (swatch chips) and `ImportDitherField` (4-col tile grid) in `src/features/import/import-option-fields.component.tsx`. Effects / Adjust / Pre / Glow are already collapsible; these three are not.

**Change** (all in `import-option-fields.component.tsx`):
- Add a local `CollapsibleField` wrapper using the repo's established uncontrolled `<details>/<summary>` pattern (same as `SliderGroup` in `import-adjust-sections.component.tsx` and the settings-panel palette library): bordered rounded box, muted label + **current selection shown on the header line** (e.g. "Dithering · Floyd–Steinberg") so the collapsed one-line state stays informative, chevron rotating on open, `max-lg:min-h-11` touch target per design conventions.
- Wrap the three fields; the Select + tile gallery move into the collapsible body.
- **Default collapsed** (no `open` attribute), consistent with the settings panel where sections open collapsed; labels reused from existing i18n keys (`import.presets`, `import.palette`, `import.dither`, `import.preset.*`, `import.dither.*`, `palette.*`) — no new strings needed except none.

## Verification

- Full gate: `npm run format:check`, `npm run lint`, `npm run arch:check`, `npm run knip`, `npx tsc --noEmit`, `npm test`.
- Manual: dev server — brightness bar left click → bright, right click → dark; import dialog groups collapsed on open, expand/collapse keep state while tweaking options.
- Run the design-review skill on the changed UI after the code gate.

## Proposed commits (you commit; I don't)

1. `fix(color): flip brightness bar pick to match white-to-black gradient`
2. `feat(import): collapse preset, palette and dither galleries to one line`

Note: your uncommitted `src/shared/ui/compare-split.component.tsx` change is unrelated and will not be touched.