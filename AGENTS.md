# AGENTS.md — conventions for AI agents and humans

Project: **Ditherlab** (glyph-editor) — a pixel/vector editor on React 19 + TypeScript + Vite.
All code is written with AI, so the settings are maximally strict: the linter and boundary
checkers are part of the feedback loop, not decoration.

## Mandatory check order (the feedback loop)

After every code change, run the chain and fix until everything is green:

```bash
npm run format:check   # oxfmt — formatting (or just `npm run format` to write)
npm run lint           # oxlint — 0 errors mandatory; warnings — advisory, see below
npm run arch:check     # dependency-cruiser — layer/feature boundaries, 0 violations
npm run knip           # dead exports/files/dependencies, 0 findings
npx tsc --noEmit       # types (also part of `npm run build`)
npm test               # vitest, all tests green
```

For machine-readable linter output in the AI loop: `npm run lint:ai` (token-minimal oxlint
format).

⚠️ Do not run `oxlint --fix` without reviewing the diff afterwards: some autofixes are
type-unsafe (history: spreading `Uint16Array` → `number[]`, `.at(-1)` → `T | undefined`,
swallowing `undefined` arguments). The offender rules are disabled in `.oxlintrc.jsonc` with
a note.

## Documentation

All documentation is written in **English** (repo language policy). The division of labor:

- `openspec/` — behavior contracts: requirements, SHALL statements, scenarios (specs +
  change workflow). Language is mandated in `openspec/config.yaml`.
- `docs/` — durable technical truth: architecture, decision records (ADRs), per-module docs.
  Index and rules: `docs/README.md`.
- New module docs are created via the template scenario (`docs/templates/`); durable
  technology choices get an ADR (`docs/decisions/`).
- **When archiving an OpenSpec change**, promote its durable `design.md` decisions into ADRs
  and update the affected `docs/modules/*.md` pages — part of the archive checklist (defined
  in `docs/decisions/0007-openspec-docs-boundary.md`).
- Perf changes must leave a row in `bench/PERFLOG.md` (English for new rows; historical rows
  stay Russian).

## Commits — Conventional Commits (enforced on `commit-msg`)

Format: `<type>(<scope>)?: <subject>` + blank line + body/footer as needed.
Preset `@commitlint/config-conventional`, config `commitlint.config.js`, hook `commit-msg`
(lefthook, config `lefthook.yml`; hooks land in `.git/hooks` via the `prepare` script
`lefthook install`).

- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`,
  `revert`.
- Header ≤ 100 characters, subject without a trailing period; subject case rules are off
  (latino-centric, they false-positive on Cyrillic) — reason commented in the config.
- Manual text check before committing: `git log -1 --pretty=%B | npm run --silent commit:check`
  (or `npx commitlint --edit <file-with-message>`).

Working rule for agents: **after every change the agent proposes the ready commit message**
(type + subject + body describing what happened) — but the human commits: the agent does not
run `git commit`.

## Structure and boundaries (enforced by `arch:check`)

```
index.html    # static landing (ru) — the crawlable public entry, no React
en/index.html # static landing (en); copy lives in the HTML, not in i18n dictionaries
editor/      # the editor SPA entry (editor/index.html) — mounted at /editor
landing/      # landing support: plain-CSS page styles + lang persistence glue
src/
  app/       # shell: app.component.tsx, app-top-bar.component.tsx, main.tsx
  features/  # vertical UI modules: canvas, tools, nodes-editor, layers,
             # settings-panel, glyph-editor, projects, export, import
  engine/    # pure domain (no React!), grouped into domain folders — one folder per meaning:
             # core/ (doc, scene, project IO), color/, cell-shapes/, grids/, shapes/, paint/,
             # effects/, geometry/ (render pipeline), texture/ (+ fill patterns), dither/,
             # glyph/, import/, output/, presets/, demos/, nodes/, gradient/, trace/
             # each family's facade is <domain>/index.ts; docs/architecture/engine-map.md is the index
  state/     # editor.store.ts (zustand) — the single app store
  storage/   # IndexedDB persistence (projects, presets, brushes, db)
  shared/    # cross-slice: ui/ (primitives + vendored shadcn), lib/ (utils), i18n/
scripts/     # landing artwork generator (art:generate), dist/ SEO self-check (seo:check)
```

Dependency rules (`.dependency-cruiser.cjs`):
- `engine` imports nothing above itself (state/storage/features/shared/app are forbidden) —
  exception: `engine/*.test.ts` may lift the store for integration scenarios.
- `storage → engine`; `state → engine + storage`; UI layers are not imported from
  state/storage.
- `features → { shared, engine, state, storage }`; **feature → feature is forbidden**.
  The only exception: `settings-panel` assembles the right column from `layers` and
  `nodes-editor`. If two features need shared code — lift it into `shared/`.

Where things go: pure pixel/geometry/serialization logic → `engine`; IndexedDB access →
`storage`; global UI and document state → `state/editor.store.ts`; screen modules →
`features/<feature>/`; reusable widgets → `shared/ui/`.

## UI layer: shadcn/ui (foundation) + Ditherlab wrappers

The UI foundation is **shadcn/ui** (Tailwind v4, radix-ui, `cn()` from
`shared/lib/utils.ts`).

- `shared/ui/shadcn/` — vendored shadcn components (`button.tsx`, `dialog.tsx`, …) with
  upstream file names. Adding a new one: `npx shadcn@latest add <component>` (aliases in
  `components.json`: ui → `@/shared/ui/shadcn`, utils → `@/shared/lib/utils`). The folder is
  excluded from knip (`knip.json`) and naming rules; an oxlint override silences upstream
  style (prop-spreading, namespace-imports). Manual edits — only documented adaptations:
  `bg-muted` → `bg-chip` (our `--muted` is the secondary text color); in `tooltip.tsx` the
  inverted `bg-foreground`/`text-background` → `bg-popover`/`text-popover-foreground` (the
  inversion looks like white plates on dark themes); the `cn` import already rewritten to
  `@/shared/lib/utils`; in `dialog.tsx` content below `lg` is a full-screen sheet (native
  mobile modals), `lg:` restores a centered modal, the `centered` prop disables the sheet for
  small confirmations; in `slider.tsx` and `select.tsx` on `max-lg` the thumb/track and list
  rows are enlarged (the 44 px rule).
- Mobile modals: content dialogs on phones/tablets (<1024px) are always full-screen —
  desktop dimensions (max-w/max-h/rounded) come only from `lg:` classes. `ConfirmDialog` is
  the exception (a centered alert).
- `shared/ui/index.tsx` and sibling `*.component.tsx` — **the project's public primitives**
  (`Chip`, `IconButton`, `Tooltip`, `Slider`, `CheckRow`, `TextField`, `ConfirmDialog`,
  `Section`): features use only these, not shadcn directly. The wrappers pin Ditherlab sizes
  (28 px chips, 10–11 px type) on top of shadcn primitives.
- Themes: Ditherlab tokens (`--app`, `--panel`, `--chip`, …) are the source of truth;
  shadcn names (`--background`, `--card`, `--primary`, `--ring`, …) are derived from them in
  each of the seven theme blocks of `src/index.css` (`@theme inline` maps both sets). A new
  color goes into both sets in all seven themes.
- New modals — on shadcn `Dialog` (Escape/backdrop/focus-trap out of the box);
  confirmations — `ConfirmDialog` (renders above modals, z-60). `TooltipProvider` is mounted
  once in `main.tsx`.

## File naming (enforced by `unicorn/filename-case` = kebabCase)

`<kebab-base>.<type>.<extension>`:

| Suffix | Purpose | Example |
|---|---|---|
| `.component.tsx` | React component | `canvas-stage.component.tsx` |
| `.hook.ts` | hook (`useXxx`) | `use-media-query.hook.ts` |
| `.store.ts` | store | `editor.store.ts` |
| `.provider.tsx` | React context/provider | `i18n.provider.tsx` |
| `.messages.ts` | localization dictionaries | `ru.messages.ts` |
| `.util.ts` | pure utilities | `file-download.util.ts` |
| `.node.ts` | engine node family | `sources.node.ts` |
| `.test.ts` | tests, colocated with the code | `shapes.test.ts` |
| `index.ts(x)` | barrel (the only name without a suffix) | `shared/ui/index.tsx` |

Engine modules are plain kebab-case without a suffix. Inside a domain folder the folder name is the context, so files carry short names (`texture/hatch.ts`, `shapes/box.ts`, `core/doc.ts`) and the family facade is the folder's `index.ts`.
Suffix exception: `shared/ui/shadcn/*` — vendored shadcn/ui files keep upstream names
(`button.tsx`, `dialog.tsx`); do not rename them (CLI regeneration).

## Code size limits (ratchet)

Global thresholds (error, for all new code):

| Rule | Limit |
|---|---|
| `eslint/max-lines` | **400 lines** per file (excluding comments/blanks) |
| `eslint/max-lines-per-function` | **150 lines** |
| `eslint/complexity` | 20 |
| `eslint/max-statements` | 60 |
| `eslint/max-depth` | 4 |
| `eslint/max-params` | 5 |

Legacy files that do not fit the thresholds are **locked by the ratchet** in the `overrides`
section of `.oxlintrc.jsonc`: each gets a cap = current size + 2. Growing is impossible (new
lines hit the cap and lint fails); if you shrink a file — shrink its cap in the override too
(or remove the override once the file fits the global thresholds). Exceptions: `*.messages.ts`
(localization data files) — free limit; tests — capped at actual size.

Already split (do not grow!): `editor.store` → slices `state/*.slice.ts` (only composition
remains in the store), `shapes` → `shapes/` folder (facade `index.ts` + `box/radial/flow/lines/
decorate/bento/skull/tools/util/fill`), `import-image` → `import/` folder (facade `index.ts` +
stage modules), `texture` → `texture/` folder (barrel `index.ts` + `core/region/field/halftone/
hatch/…`), `presets` → `presets/` folder, `app-top-bar` → `top-bar-*.component.tsx`, `grids` →
`grids/` folder (`index.ts` facade + `builders/lattices/geometry/rotate/polar`), `cell-shapes` →
`cell-shapes/` folder (`index.ts` + `defs/geom/ext/frag`), `doc` → `core/doc.ts` (model) +
`core/doc-resize.ts` (resize/sub-detail), `fillpatterns` → `texture/fill.ts` (apply) +
`texture/fill-patterns.ts` (math) + `texture/fill-data.ts`, `tool-rail` → `tool-rail-list`,
`settings-panel` → section components, `canvas-stage` → staging hook + selection/panel
components + `stage-paint*.util` (base-canvas frame: baked bg/grid layers, incremental stroke
layer, pixel-bitmap preview, legacy fragment path; dispatch in `stage-paint-frame.util.ts`).

Still waiting for splits (measure first — the authoritative caps live in the
`.oxlintrc.jsonc` overrides; numbers drift): `canvas-stage` (~1260 lines),
`node-editor-canvas` (~1244), `use-canvas-staging` (~874) — split by feature/layer per
the structure above.

## TypeScript — strict profile

`strict` + `noUnusedLocals` + `noUnusedParameters` + `noFallthroughCasesInSwitch` +
`noUncheckedSideEffectImports` + `verbatimModuleSyntax` (always `import type`) +
`noImplicitOverride` + `noPropertyAccessFromIndexSignature` (index-signature access only via
`obj['key']`) + `forceConsistentCasingInFileNames`.

Deliberately deferred (enable when there is a refactoring window):
- `noUncheckedIndexedAccess` — 1390 errors on current code; goal #1.
- `exactOptionalPropertyTypes` — conflicts with React 19 props (~1500 places).

## oxlint — categories and meaning

`.oxlintrc.jsonc`: `correctness` + `suspicious` + `pedantic` = **error**, `style` +
`restriction` = **warn**. Every disabled rule has a reason comment (domain: geometry/pixels,
bitwise ops, hot-path mutations). react-hooks rules (`exhaustive-deps`,
`memo-dependencies`) — **advisory**: read them on every review; in
`canvas-stage.component.tsx` the "extra" dependencies are intentional hot-path closures.

## Design conventions and UI review

`.zcode/skills/design-conventions/SKILL.md` — layout metrics, touch targets, color tokens,
z-index, breakpoints, editor-specific patterns (all values measured from code).
`.zcode/skills/design-review/SKILL.md` — the UI-review checklist (run after the code gate
before handing a change over). Any UI code must comply.

## Formatting — oxfmt

`.oxfmtrc.json` pins everything: 100 columns, 2 spaces, no semicolons, single quotes,
trailing commas, `sortImports`, `sortTailwindcss`, `jsdoc`, `sortPackageJson`.
Import order is never edited by hand — only via oxfmt.

## Performance: bench + PERFLOG

Baseline and the performance change journal — `bench/PERFLOG.md`. Every perf change must
leave a row there: metric → before → after → Δ% → cause (commit/files).

```bash
npm run bench        # vitest bench over the engine → bench/results/engine-bench.json
npx vitest bench --run --compare bench/results/engine-bench.json   # + delta columns
```

Browser harness for real frames: `npm run dev` → `http://localhost:5174/editor/?bench=1&autorun=1`
(CanvasStage on the live store: loadDoc / commit / zoom / e2e stroke / undo; report —
`window.__benchReport`, copy/download buttons on the panel). Metric — dispatch → effects
complete (robust to window occlusion); the `framesLive` flag marks runs without live frames.

Canvas limits: `MAX_SIZE = 4096`, buffer ≤ `MAX_CELLS = 16_777_216` cells — `fitSub` lowers
the sub-detail when `size × sub` would exceed the product. Pixel geometry (radii 0, no
texture, sizeX/Y = 1) automatically merges runs into RLE rectangles (`src/engine/geometry/shape.ts`);
rounded/textured styles go through the per-cell path. Regression ratchets —
`perf-stress.test.ts` (cost ratios, not absolute times).
