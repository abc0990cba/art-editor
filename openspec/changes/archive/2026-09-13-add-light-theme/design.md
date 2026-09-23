# Design: add-light-theme

## Tokens

`src/index.css` defines the palette as CSS custom properties and maps them into Tailwind v4:

```css
:root { --app: #131316; --panel: #17171b; --raised: #1e1e23; --body: #e4e4ea;
        --muted: #9a9aa6; --line: rgba(255,255,255,0.10); --chip: rgba(255,255,255,0.05);
        --chip-line: rgba(255,255,255,0.10); --accent-soft: rgba(129,140,248,0.15); }
[data-theme="light"] { --app: #eef0f4; --panel: #e6e8ee; --raised: #ffffff; --body: #24242b;
        --muted: #63636e; --line: rgba(20,20,35,0.12); --chip: rgba(20,20,35,0.04);
        --chip-line: rgba(20,20,35,0.12); --accent-soft: rgba(99,102,241,0.12); }
@theme inline {
  --color-app: var(--app); --color-panel: var(--panel); --color-raised: var(--raised);
  --color-body: var(--body); --color-muted: var(--muted); --color-line: var(--line);
  --color-chip: var(--chip); --color-chip-line: var(--chip-line);
  --color-accent-soft: var(--accent-soft);
}
```

`data-theme` is set on `document.documentElement`. Indigo accent utilities
(`accent-indigo-400`, `bg-indigo-500`, `text-indigo-…`) work acceptably on both themes and stay.

## Canvas theme object

`engine/doc.ts` (or `index.css`-adjacent module) gains:

```ts
export interface StageTheme { checkerA, checkerB, gridLine, pixelLine, guide, hover, frame }
export const STAGE_THEMES: Record<'dark' | 'light', StageTheme>
```

CanvasStage reads the resolved theme from the store and picks the object per draw pass.

## State

`themePref: 'dark' | 'light' | 'auto'` in the UI slice, persisted at `glyph.theme`. An effect
resolves `auto` via `matchMedia('(prefers-color-scheme: dark)')` with a change listener, writes
`document.documentElement.dataset.theme`, and stores the resolved value (`resolvedTheme`) for
CanvasStage.

## Sweep

Mechanical replacement per component: `bg-[#131316]`→`bg-app`, `text-neutral-200/300`→`text-body`,
`text-neutral-400`→`text-muted`, `border-white/10`→`border-line`, `bg-white/5`→`bg-chip`,
`hover:bg-white/10`→`hover:bg-chip-active` (token `--chip-active`), `text-neutral-500`→`text-muted`,
`bg-black/60 …`→themed tokens. Chip active/indigo styles keep indigo but use tokens for borders.

## Testing

`theming.test.ts`: token file exports `STAGE_THEMES` with all keys present for both themes and
light values distinct from dark; store resolves `auto` (mocked `matchMedia`) and persists the
preference. Visual verification via browser screenshots in both themes.
