# SVG studio — technical notes

## Scope

Authored-by-hand vector gradient art: `src/engine/svgart/` plus the studio workspace feature
(`src/features/svgart/`). Fourth project kind (`kind: 'svgart'`), the first that is not a
tracer — the scene exists from the start (a generated template) and every layer stays editable.
Hard product constraint: the exported SVG consists **only of the subset Adobe Illustrator opens
as live vectors** (see [research/ai-import](../research/ai-import.md)); softness is always a
`stop-opacity` falloff, never a filter or a blend mode. The engine is pure TS; the feature has
no worker — serialization is cheap.

## Module map

| File | Role |
|---|---|
| [`src/engine/svgart/types.ts`](../../src/engine/svgart/types.ts) | `SvgScene`/`SvgLayer`/`Shape`/`Paint` model — parameters only, nothing baked |
| [`src/engine/svgart/color.ts`](../../src/engine/svgart/color.ts) | hex ↔ 0..1 sRGB (the shared `color/` domain works in 0..255) |
| [`src/engine/svgart/oklab.ts`](../../src/engine/svgart/oklab.ts) | OKLab ↔ sRGB for perceptual stop ramps (Björn Ottosson's formulation) |
| [`src/engine/svgart/paint.ts`](../../src/engine/svgart/paint.ts) | stop evaluation (pad semantics), `rampStops` (sRGB/OKLab), CSS previews for the stop bars |
| [`src/engine/svgart/figures.ts`](../../src/engine/svgart/figures.ts) | parametric contours → absolute path `d`; rotations baked (ellipse = 4 kappa cubics) |
| [`src/engine/svgart/hit.ts`](../../src/engine/svgart/hit.ts) | point-in-shape (even-odd), `fillHandles` (axis/center/rim/focus), `topLayerAt` |
| [`src/engine/svgart/edit.ts`](../../src/engine/svgart/edit.ts) | pure edit ops: translate/rotate layers (incl. path-data transforms), `dragHandle` |
| [`src/engine/svgart/serialize.ts`](../../src/engine/svgart/serialize.ts) | `sceneToSvg` — the AI-safe output; `FORBIDDEN_RE` pins the contract |
| [`src/engine/svgart/softlayers.ts`](../../src/engine/svgart/softlayers.ts) | glow/shadow/highlight as ellipses with radial `stop-opacity` falloffs (the star_v3 technique) |
| [`src/engine/svgart/light.ts`](../../src/engine/svgart/light.ts) | 2.5D light bake: face brightness `ambient + strength·(1−ambient)·max(0, cos Δ)`, light-aligned axes |
| [`src/engine/svgart/templates.ts`](../../src/engine/svgart/templates.ts) | star / sphere / aurora / blank generators + palettes; output = ordinary editable layers |
| [`src/engine/svgart/normalize.ts`](../../src/engine/svgart/normalize.ts) | defensive scene reader for IndexedDB round-trips (clamp, repair, drop) |
| [`src/engine/svgart/compat.ts`](../../src/engine/svgart/compat.ts) | per-effect Illustrator status for the UI badges (`safe` / `verify`) |
| [`src/state/svgart.slice.ts`](../../src/state/svgart.slice.ts) | scene + selection, immutable `updateSvgArtScene`, throttled autosave (gradient-slice pattern) |

## How it works

**Model → SVG.** The scene stores parameters; `sceneToSvg` bakes everything into coordinates.
Gradients serialize as `gradientUnits="userSpaceOnUse"` with absolute geometry, or — when
`units: 'bbox'` — as objectBoundingBox fractions (the SVG default, attribute omitted), which
gives elliptical falloffs on non-square shapes with zero transforms. `gradientTransform` is
never emitted (Illustrator drops it on import); fill stacks become same-`d` path copies painted
bottom-to-top; layer opacity becomes a `<g opacity>` wrapper. The live stage renders this exact
string, so the browser preview is byte-identical to the export.

**AI-safe contract.** `FORBIDDEN_RE` (serialize.ts) is the machine-checkable half: no filters,
no `mask`, no `mix-blend-mode`, no `fr`, no `reflect`/`repeat`, no `gradientTransform`. The
human-checkable half is `samples/ai-import-test-svgart.svg` + the studio section of
[research/ai-import](../research/ai-import.md) — radial `fx/fy` is the one construct to
manually verify in Illustrator (UI badges mark it `verify`).

**Templates.** `starScene` builds a low-poly star: per-face triangles, pseudo-normal from the
face centroid angle, brightness via `faceBrightness`, each face a linear gradient aligned to
the light (`lightAxis`), lit faces get a baked sheen alpha band; floor shadows and halo are
soft layers. `sphereScene` is one bbox radial with an offset focus + contact shadow.
`auroraScene` stacks seeded soft spots. All output is plain layers — no runtime re-generation.

**Editing.** The stage converts pointer events to scene coordinates through the fitted stage
rect (`fitInto`) and calls pure engine ops: `translateLayer`/`rotateLayer` (path `d` included —
`translatePathData`/`rotatePathData` cover the generator's absolute M/L/C/Z subset) and
`dragHandle` (bbox-fraction radials map through `shapeBBox`). Fill/stop editing happens with
immutable updaters through `updateSvgArtScene`.

## Feature & persistence

Workspace = stage + right column (layers / shape / fills sections; `MobileSheet` below lg).
Storage: `SvgArtProjectEntry` with the normalized scene — no IDB version bump
(upgrade-on-read, same as the trace kinds). Library cards render a live thumbnail via
`sceneToSvg(entry.scene)`. The studio takes no raster imports (tracing belongs to the
gradient workspace).

## Testing

Colocated in `src/engine/svgart/` — oklab round-trips (Ottosson reference values), stop
evaluation and ramps (incl. the sRGB blue→red lightness dip OKLab avoids), figure geometry
(rotated extremes), hit-testing (concave star), edit ops (path-data translation), serializer
markup + `FORBIDDEN_RE` + golden fixtures (`svgart-golden.json`, regenerate with
`UPDATE_SVGART_GOLDENS=1 npx vitest run src/engine/svgart/serialize.test.ts`), template
structure (10 star faces, light-aligned axes, AI-safe integration through the serializer).

## Related decisions

- [research/ai-import](../research/ai-import.md) — the compatibility matrix and both spike sheets.
- [gradient-workspace](gradient-workspace.md) — the tracing sibling; shares the AI-safe
  philosophy and the workspace/autosave pattern.

## OpenSpec capabilities

- `openspec/changes/add-svgart-workspace/` (deltas: `svg-studio`, `project-library`).
- Closes the deferred manual-handles item (6.1) of `add-gradient-workspace` for this workspace.

## Known limitations

- No SVG import (studio-authored or gen3-style files) — export-only for now.
- No filters/blend modes by policy; revisit only if the spike sheet proves Illustrator keeps
  them live.
- Poly/path layers rotate around the bbox center; anchors are not individually editable yet.
- No undo history (matches the vector/gradient workspaces).
