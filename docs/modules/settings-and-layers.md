# Settings & layers panels — technical notes

## Scope

The right settings column (`src/features/settings-panel/`) and the layers panel
(`src/features/layers/`). The settings panel is the *only* feature allowed to import other
features (it assembles layers + nodes-editor into the column) — a documented
dependency-cruiser exception.

## Module map

| File | Role |
|---|---|
| [`src/features/settings-panel/settings-panel.component.tsx`](../../src/features/settings-panel/settings-panel.component.tsx) | section composition + palette I/O + shared style targeting |
| [`src/features/settings-panel/brush-section.component.tsx`](../../src/features/settings-panel/brush-section.component.tsx) | pixel size, tip editor, brush preset library |
| [`src/features/settings-panel/style-section.component.tsx`](../../src/features/settings-panel/style-section.component.tsx) | cell shape/rounding, render mode, style-scope toggle, `StyleTarget` |
| [`src/features/settings-panel/texture-section.component.tsx`](../../src/features/settings-panel/texture-section.component.tsx) | effect chips + sliders (square grids only) |
| `src/features/settings-panel/symmetry-section / -preview` | mode pickers + inline live preview canvas |
| [`src/features/settings-panel/shape-picker.component.tsx`](../../src/features/settings-panel/shape-picker.component.tsx) | cell-form tiles + per-form param sliders |
| [`src/features/settings-panel/rounding-controls.component.tsx`](../../src/features/settings-panel/rounding-controls.component.tsx) | presets, arc/chamfer, per-corner overrides |
| [`src/features/settings-panel/canvas-section.component.tsx`](../../src/features/settings-panel/canvas-section.component.tsx) | radial even, size, sub-detail, connector width, bg, grid |
| [`src/features/settings-panel/presets-dialog.component.tsx`](../../src/features/settings-panel/presets-dialog.component.tsx) | built-in + user presets, apply/create/overwrite |
| [`src/features/settings-panel/style-previews.component.tsx`](../../src/features/settings-panel/style-previews.component.tsx) | `PixelStylePreview`, `TexturePreview` (real geometry) |
| [`src/features/layers/layers-panel.component.tsx`](../../src/features/layers/layers-panel.component.tsx) | scene-tree rows, reorder, visibility/lock, group/ungroup |

## How it works

**Section composition** (`PANEL_SECTIONS` order): color, layers, nodes (graph presets),
brush, glyphs, presets, style, texture, symmetry, canvas. The panel accepts
`openSection`/`onOpenSection` (reveal + scroll). Store slices touched: `doc` (palette, style),
`tools`/color state, `style` (patches, scope, render mode, connectivity), `selection`
(restyle/fill/clear), `symmetry`, `brush`, `presets`, `glyph`.

**Style targeting.** `StyleTarget` (style-section) is the shared contract deciding where an
edit lands: element scope vs global (`setStyleScope`), selection-targeted
(`restyleSelection`) vs canvas-wide (`patchStyle` etc.), with views for style, render mode,
connectivity, metaball and texture. Global scope shows a hint that settings repaint the whole
canvas; in element scope each stroke keeps its frozen snapshot
([doc-and-scene](doc-and-scene.md)).

**Previews render through the real engine** — the section previews build small `Doc`s and
draw via `buildGeometry` + `drawGeometry`, so "the icon always matches the ink"
(shape-picker header). `TexturePreview` uses a 4×3 grid with 49 px cells ("few large cells:
the texture specks render big enough to judge clearly"). The symmetry preview stays an inline
canvas on purpose: "inside a Radix portal the content mounts one commit after the component,
and a draw-on-mount effect would run before the canvas exists" — it redraws a fixed
asymmetric seed doodle through `symmetryPoints` on every change.

**Brush section**: tip presets as small canvases ("active cells in the accent color"),
custom tip pattern editing inline (no separate dialog), snap toggle, `brushId` (null = hand-
edited tip); tip shapes that degenerate at the current size are disabled with a hint
(`TIP_MIN_SIZE`, [paint-tools](paint-tools.md)).

**Layers panel**: rows built from the scene tree — "top of the canvas first (reverse tree
order)", groups nested. Capabilities: select (layer → activeLayer; object → selection),
visibility/lock toggles (`toggleNodeVisible`/`toggleNodeLocked`; locked-or-hidden ancestors
protect via `nodeProtected`), inline rename, drag-and-drop reorder (`reorderNode(id, target,
'before'|'after')`, rejected into own subtree), add/delete layer, group/ungroup selection.
Global-scope (flat) docs show a scope hint instead of tree rows.

**Presets dialog**: built-ins + user entries, thumbnails via `presetPreviewDataURL`,
`configMatchesState` highlighting, apply (+ `requestFit`) / create / overwrite / duplicate
([palettes-and-presets](palettes-and-presets.md)).

## Invariants & constraints

- Cross-feature imports: only `settings-panel` may import `layers`/`nodes-editor`
  (`.dependency-cruiser.cjs` exception, documented in AGENTS.md).
- Every preview is derived from the same engine geometry — no hand-drawn icon approximations.
- Section components stay presentational; state changes go through store actions.

## Performance characteristics

Preview canvases are tiny (12×6 cells, 4×3 texture grid, 24×14 symmetry grid) and redraw on
settings change only; thumbnails in the presets dialog are cached by the preset preview
cache. No benches target the panels; they are outside the interaction hot path.

## Testing

Covered indirectly through store/engine tests (style snapshots, scope transitions, reorder
invariants). UI behavior is verified by the design-review checklist
(`.zcode/skills/design-review/SKILL.md`).

## Related decisions

- [ADR-0005](../decisions/0005-zustand-single-store.md) — panels act purely through store
  actions.

## OpenSpec capabilities

- `openspec/specs/pixel-styling/spec.md`, `openspec/specs/color-picker/spec.md`;
  per-element styles: `openspec/changes/add-element-styles/`.

## Known limitations

- Texture section is square-grids-only (engine limitation, [texture](texture.md)).
- No drag-reorder for sections; the order is fixed in `PANEL_SECTIONS`.
