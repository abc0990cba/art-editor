# App shell — technical notes

## Scope

`src/app/`: entry dispatching, TanStack Router, the project route binding, the pixel
workspace composition, the top bar, hotkeys, the vectorize bridge, the bench harness; plus
`src/shared/i18n/` and the theme system in `src/index.css`.

## Module map

| File | Role |
|---|---|
| [`src/app/main.tsx`](../../src/app/main.tsx) | entry dispatcher (editor/index.html): app boot or `?bench=1` harness (both dynamic imports) |
| [`src/app/app-boot.tsx`](../../src/app/app-boot.tsx) | StrictMode + TooltipProvider; legacy migration + demo seed before first route |
| [`src/app/router.tsx`](../../src/app/router.tsx) / `project-search.ts` | routes `/` and `/p/$projectId` under `basepath: '/editor'`; typed search params |
| [`src/app/project-route.component.tsx`](../../src/app/project-route.component.tsx) | binds the library entry to the store; kind-switches the workspace |
| [`src/app/pixel-workspace.component.tsx`](../../src/app/pixel-workspace.component.tsx) | tool rail \| editor pane (stage + node editor, split/overlay) \| settings column; mobile drawers |
| `src/app/app-top-bar*.component.tsx` | identity/actions/view controls; mobile composition |
| [`src/app/use-hotkeys.hook.ts`](../../src/app/use-hotkeys.hook.ts) | global hotkey registry |
| [`src/app/use-vectorize-bridge.hook.ts`](../../src/app/use-vectorize-bridge.hook.ts) | pixel → new vector project handoff |
| [`src/app/theme-swatches.component.tsx`](../../src/app/theme-swatches.component.tsx) | theme swatch colors for the selector |
| `src/app/bench/*` | performance harness (scenarios, report, `window.__benchReport`) |
| `src/shared/i18n/*` | typed dictionaries, EN/RU, per-key fallback |

## How it works

**Entry** (`main.tsx`): "the regular editor boot, or the ?bench=1 performance harness… Both
branches load dynamically so the bench page never pays for app module side effects." Boot
runs `migrateLegacySession()` and `seedDemoProject()` *before* the first route "so the home
screen and Continue card never see unclaimed state".

**Routing** (TanStack Router): the SPA is the `editor/index.html` page, mounted at `basepath:
'/editor'` — the site root is the static landing (see
[ADR-0008](../decisions/0008-landing-static-mpa.md)); hosting rewrites `/editor` and
`/editor/*` to that page (`public/_redirects`, `vercel.json`, mirrored by the Vite dev/preview
middleware). rootRoute → homeRoute `/` (`HomeScreen`, navigation injected as `onOpen` —
"features stay app-agnostic") and projectRoute `/p/$projectId` whose loader loads the library
entry (missing → redirect home: "the library entry is the single source of truth"). Typed
search params (`panel`, `nodeOpen`, `node: 'split'|'overlay'`, `nodeSplit` 0.25..0.8) are view
state: "every write is a replace", synced store ↔ URL by `useViewSearchSync` — reload restores
the workspace layout Figma-style.

**Project route**: binds the loaded entry (`openProject`) and fills the workspace the kind
calls for — pixel (`loadDoc(deserialize(entry.doc))`, corrupted → fresh doc; bound "before
first paint so the canvas never flashes the boot document"), vector or gradient
(`loadVectorEntry`/`loadGradientEntry`). Import/paste routes by kind. The pixel workspace
composes `ToolRail | (CanvasStage + NodeEditorCanvas, draggable split or overlay) |
SettingsPanel`, with mobile tool strip / panel drawer compositions.

**Hotkeys** (`use-hotkeys.hook.ts`): skipped in inputs. Tools on single keys (v/b/e/g/i/l/r/o/
c/s/n/d/h/q/a/k/m/w/x/j/u + z/t/y/p and 1–5 for the newer shapes), `f` fit, Delete/Backspace
delete selection, arrows nudge (Shift ×10), `[`/`]` brush size. Modifiers: Ctrl/Cmd+Z /
Shift+Z / Ctrl+Y undo-redo, A select-all, G/Shift+G group/ungroup, D duplicate,
Ctrl+S force save with a fresh thumbnail ("saving is ambient now"),
Ctrl/Cmd+`[`/`]` stacking order (shiftTarget). Known deliberate collisions: bare `s` is the
star tool; bracket pairs differ by modifier.

**i18n**: `I18nProvider` reads `lang` from the store; `t: (key: keyof Dict) => string` with
`Dict` inferred from `en.messages.ts` (~1500 keys) and per-key fallback `dicts[lang][key] ??
en[key]`.

**Themes** (`src/index.css` header): "Ditherlab design tokens are the source of truth (seven
themes via `<html data-theme>`): dark, oled, nord, paper, tokyo-night, vscode, catppuccin…
The shadcn/ui variable names (--background, --card, --primary, …) are derived from them in
every theme block… while the historic ditherlab utilities (bg-app, text-muted, …) keep
working." `@theme inline` maps tokens into Tailwind v4; adaptation rule for vendored shadcn:
`bg-muted` → `bg-chip` (here `--muted` is a secondary *text* color). The stage has its own
separate 7-theme palette (`engine/core/stage-themes.ts`).

**Bench harness** (`?bench=1&autorun=1`): mounts the *real* CanvasStage on the *real* store
("each scenario drives the real app pipeline — store actions, React render, canvas effects,
pointer/wheel events") and measures dispatch → effects-complete (12 MessageChannel hops —
"throttle-immune macrotask hop… paint itself is excluded by design"; `framesLive` flags
occluded panes). Sizes: 512², 2048², 4096² fixtures; results on `window.__benchReport` with
copy/download for PERFLOG. Scenarios live in `bench-scenarios.ts` (+ `bench-scenarios-graph.ts`
for node-graph groups).

## Invariants & constraints

- Features must not import the router — navigation is injected (home screen `onOpen`).
- The route loader owns entry loading; surfaces must bind the entry before first paint.
- `?bench` bypasses the app shell entirely (no dialogs, no autosave interplay).

## Performance characteristics

The harness measures: loadDoc, commit, zoom, stroke e2e, undo, node drag/scrub, wheel bursts,
idle-with-selection. Methodology notes (tinybench floors, `framesLive` caveats, PRNG
pitfalls): `docs/research/performance.md` §11.

## Testing

Store/route integration is covered by engine-lifted tests; the harness itself is a dev tool
(see `bench/PERFLOG.md` for the measurement protocol).

## Related decisions

- [ADR-0005](../decisions/0005-zustand-single-store.md) (single store the shell binds to);
  [ADR-0006](../decisions/0006-indexeddb-persistence.md) (loader reads the library).

## OpenSpec capabilities

- `openspec/specs/i18n/spec.md`, `openspec/specs/theming/spec.md`,
  `openspec/specs/project-library/spec.md`; routing deltas in
  `openspec/changes/add-project-home/` (`app-routing`).

## Known limitations

- No URL for in-canvas view state (zoom/pan) — only panel/layout state is in the search.
- Bench numbers under occluded panes are cadence-bound (`framesLive: false` caveat).
