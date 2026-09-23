# Editor Config Presets

Add named presets that capture **all** changeable editor params (grid type + size, sub-cells, palette, render mode, pixel style, metaball settings, connectivity, background, connector width, symmetry) — everything except painted content. 8 built-in "beautiful art" presets ship read-only; user presets get full CRUD. UI = quick-apply "Presets" section in the settings panel + a "Manage presets" dialog (clones the ProjectsDialog pattern). Follows the repo's OpenSpec workflow.

## 1. Data model — new `src/engine/presets.ts`
- `interface PresetConfig { v: 1; gridType; cols; rows; sub; palette: string[]; style: PixelStyle; renderMode; connectivity; metaball; bg; connectorWidth; symmetry: SymmetryState }`
- `interface EditorPreset { id; name; config }` (built-ins carry fixed ids `builtin.*`).
- `presetFromDoc(doc, symmetry)` — snapshot current settings.
- `normalizePresetConfig(raw): PresetConfig` — defensive validation/clamping, copying the `deserialize()` pattern in `engine/project.ts` (clamp cols/rows 1..100, sub 1..3, enum whitelists, hex regex for palette/bg, range clamps for radius/size/convex/concave 0..0.5 & 0.05..1, strength 0..100, quality 2..8, connectorWidth 0.05..1, symmetry n 2..24).
- `configMatchesState(config, doc, symmetry): boolean` — deep equality for active-highlight (like `matchedPresetId` for palettes).
- `BUILTIN_PRESETS: readonly EditorPreset[]` — 8 presets (params below).

### Built-in presets (all params valid per doc.ts ranges)
| id | name | key params |
|---|---|---|
| `builtin.neon-metaballs` | Neon Metaballs | square 24×24, sub 2, metaball (strength 62, perColor, quality 6), corner-bridge, bg `#0b0f1c`, neon palette, kaleido n=6 |
| `builtin.gameboy` | Game Boy | square 20×18, sub 1, pixels, radius 0, size 0.92, Game Boy palette, bg `#9bbc0f`, symmetry off |
| `builtin.bubblegum` | Bubblegum | square 20×20, sub 2, pixels, circle (radius 0.5), size 0.85, pastel palette, bg `#fff5fa`, quad symmetry |
| `builtin.blueprint` | Blueprint | square 28×28, sub 1, outline (convex 0.12 / concave 0.08), corner-bridge, bg `#0a2f5c`, white/blue palette |
| `builtin.kaleido-bloom` | Kaleido Bloom | hex 22×22, sub 2, metaball (strength 55, quality 6), bg `#12081f`, jewel palette, radial symmetry n=12 |
| `builtin.retro-chamfer` | Retro Chamfer | square 24×24, sub 1, pixels, chamfer corners (radius 0.3), size 0.9, Sweetie 16 palette, bg `#1a1c2c`, diag8 symmetry |
| `builtin.mandala` | Mandala | radial 16 sectors × 14 rings, sub 2, pixels, bg `#160e24`, sunset palette, radial symmetry n=16 |
| `builtin.sticker-pop` | Sticker Pop | square 20×20, sub 1, outline (convex 0.42 / concave 0.3), corner connectivity, bg `#ffffff`, bold primary palette |

## 2. Storage — refactor + new `src/storage/presets.ts`
- **Gotcha to handle:** `projects.ts` opens DB `glyph-editor` at version 1; adding a `presets` store requires version 2. Two modules opening the same DB at different versions breaks (`VersionError`). Extract a shared `openDb()` into `src/storage/db.ts` (version 2, `onupgradeneeded` creates `projects` with its `by_updated` index if missing + new `presets` store), and make `projects.ts` use it — its public API stays unchanged.
- `PresetEntry { id; name; createdAt; updatedAt; config: PresetConfig }`; API mirrors projects.ts: `listPresets`, `savePreset`, `loadPreset`, `deletePreset`, `newPresetId`, plus `clearPresetsForTests()` and the same in-memory Map fallback. Normalize config via `normalizePresetConfig` on read and write.

## 3. Store — `src/state/store.ts`
- State: `presets: PresetEntry[]`, `presetsReady: boolean`; `App.tsx` fires `loadPresets()` once on mount.
- `applyPreset(preset)` — one undoable doc transition (zundo partializes `doc`): gridType/size via the same `convertGridDoc`/`resizeDoc` path `setSize`/`setGridType` use (content preserved by cell sampling), then `changeSub` if needed, then merge palette/style/renderMode/connectivity/metaball/bg/connectorWidth; also sets `symmetry` (non-undoable, consistent with existing symmetry semantics).
- `createPreset(name)` (snapshot current), `overwritePreset(id)` (write current config into user preset), `renamePreset`, `deletePreset`, `duplicatePreset` — each awaits the IDB op then refreshes the state list. No replace-guard needed (content is never destroyed, and apply is undoable).

## 4. Preview thumbnails — new `src/engine/presetPreview.ts`
- `presetPreviewDataURL(preset, maxSide=128): string` — builds a sample doc from the preset config with a deterministic procedural "blob flower" pattern (radial cosine field, colors cycling the preset palette), rendered via the existing `renderThumbnailDataURL`. Memoized per `id|updatedAt`. No storage of thumbnails. (Config-only presets have no content, so previews are generated — this makes the "beautiful art" presets actually visible when choosing.)

## 5. UI
- **`src/components/PresetsDialog.tsx`** (clone ProjectsDialog: overlay, Esc/click-outside close, inline rename, inline delete confirm): "Save current settings" input+button on top; card grid of all presets (built-ins first, "built-in" badge, active card accent-highlighted). Card: preview image, name (inline-renameable for user presets), summary line (`grid · WxH · mode`), actions Apply / Duplicate / Overwrite with current (user only) / Rename (user) / Delete (user, confirm).
- **`SettingsPanel.tsx`**: new collapsible "Presets" `Section` after Grid — rows like the palette list (24px preview thumb + name, built-ins marked), click applies, active row highlighted; footer "Manage…" button opens the dialog.
- Built-in display names go through i18n (`presetName.*` keys) like palette presets.

## 6. i18n — `src/i18n/en.ts` + `ru.ts`
Keys for: panel section, dialog title, save placeholder/button, apply, duplicate, rename, delete, confirmDelete, overwrite, built-in badge, manage, error, and the 8 built-in names (EN + RU).

## 7. OpenSpec artifacts
Create `openspec/changes/add-editor-presets/` per repo convention: `proposal.md`, `tasks.md`, and delta `specs/editor-presets/spec.md` (requirements: config scope, apply is undoable & content-preserving, built-ins read-only, CRUD in IndexedDB store `presets` in DB `glyph-editor` v2 with in-memory fallback, panel section + manage dialog, i18n EN/RU).

## 8. Tests & verification
- `src/engine/presets.test.ts` — built-ins valid (unique ids, hex palettes, enums, ranges), `normalizePresetConfig` clamps garbage, snapshot→apply→match round-trip.
- `src/storage/presets.test.ts` — CRUD + in-memory fallback (mirrors `projects.test.ts`).
- Run `npx oxlint`, `npm test`, `npm run build`; quick smoke via dev server.

**Out of scope:** import/export of presets as files, editing built-ins in place (duplicate instead), storing thumbnails in IDB.
