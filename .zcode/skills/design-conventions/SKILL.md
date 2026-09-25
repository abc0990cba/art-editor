---
name: design-conventions
description: >
  Design system and UI conventions of the Ditherlab pixel editor: layout metrics,
  touch targets, spacing, radii, colors, z-index scale, breakpoints and editor-specific
  interaction patterns. Use when writing or changing any UI code (components, panels,
  dialogs, toolbars, mobile layouts) so every element matches the established
  conventions instead of inventing new sizes.
allowed-tools: Bash(rg:*), Bash(grep:*), Read
metadata:
  author: ditherlab
  version: "1.0"
---

# Design conventions — Ditherlab

Write UI as if Figma/Photoshop/Procreate shipped it: every size below is measured from
the shipped code, not invented. When a change needs a size that is not here, first check
adjacent code; then propose the new token in the PR description instead of a magic number.

## 1. Layout metrics

| Zone | Desktop (≥1024px) | Mobile/tablet (<1024px) |
|---|---|---|
| Top bar height | `h-12` (48px) | `h-14` (56px) |
| Tool rail | labeled `w-48` (192px) | hidden; bottom strip `h-14` with 44px buttons |
| Right panel | `w-64` (256px) column | slide-over drawer `w-72` (288px), `max-w-[88vw]` |
| Node editor | split with 1px divider | full-screen overlay (`max-lg:absolute max-lg:inset-0`) |

Breakpoint: **`lg` (1024px)** is the only structural switch. Use `useMediaQuery('(max-width: 1023px)')`
in React and `lg:`/`max-lg:` in classes — never invent other structural breakpoints.
`sm:`/`md:` are only for cosmetic degradation inside the top bar.

## 2. Touch targets and controls

- **44px minimum** hit target on mobile (`h-11 w-11` buttons, `h-11` menu rows) — Apple HIG / Material.
- Desktop chip plates: `h-7` (28px) uniform — every top-bar control is exactly this height, vertically centered in the 48px bar.
- Icon buttons: use `IconButton` (`plate` for chip background, `big` for 40px mobile size). Never hand-roll a `<button>` with an svg on the toolbars.
- Sliders: label left, value right (editable → `DragNumber`), range input full width.
- Gap scale: `gap-1` inside tool groups, `gap-2`/`gap-3` between groups, `gap-0.5` never (post-plate era).

## 3. Spacing and radii

- **4px grid**: paddings/margins in multiples of 4 (`p-2`, `p-3`, `px-2.5` is the only half-step, for chip content).
- Radii (measured usage): `rounded-md` (buttons, chips, inputs — default), `rounded-lg` (cards, rail rows, inner panels), `rounded-xl` (dialogs, floating panels, sheets), `rounded-full` (avatars, floating undo/redo, dots), `rounded-sm` (2px micro-frames). Do not mix up: dialog = xl, card = lg, control = md.
- Panels/dialogs padding: `p-3`–`p-4`; section headers `text-[10px]/[11px] uppercase tracking-widest text-muted`.

## 4. Color tokens (never raw hex in JSX)

`bg-app` (canvas surround), `bg-panel` (panels/dialogs), `bg-raised` (popovers), `bg-chip`
(plates, inputs), `bg-chip-active` (hover), `border-line` (all borders), `border-chip-line`
(hover border), `text-body` (primary text), `text-muted` (secondary), accent trio
`bg-accent-soft text-accent-text border-accent-line` for selection states, semantic red
`red-400/500` only for destructive actions. All colors flow from the theme (light/dark) —
a raw hex in JSX is a bug (the only exceptions are canvas-drawn pixels and logo gradients).

## 5. Z-index scale

`z-10` in-panel floats → `z-20` banners/status → `z-30` node editor overlay → `z-40`
backdrops & drawers → `z-50` modals/popovers/tooltips → `z-60` confirm-on-top-of-modal.
Tooltips and dropdown bubbles always portal to body. Anything above `z-50` needs a reason.

## 6. Editor interaction conventions

- Canvas: pointer events + `touch-none`; one finger draws, two fingers = pinch/pan (capture-phase listeners win over drawing). Keyboard shortcuts work globally; inputs excluded via `closest('input,textarea,select')`.
- Destructive actions (clear canvas, delete project) require a `ConfirmDialog`; the action must stay undoable where possible and say so in the message.
- Every list row of a library (projects, brushes, glyph sets) = thumbnail + name + meta + actions; the current entry is marked with the accent border + «current» chip.
- New project flow: startup catalog (home) → create dialog (name + size + grid) → canvas. Never drop the user straight onto a destructive replace without `ConfirmDialog`.
- Selection: marching-ants dashed outline (implemented in canvas), not DOM outlines.
- Panels are `<details>` sections (collapsed by default) with `text-[11px] uppercase tracking-widest text-muted` headers and an optional `SECTION_GLYPHS` icon.

## 7. A11y

- Every icon-only control: `aria-label` (via `IconButton` `title`/`Tooltip`) — no exceptions.
- Dialogs: Escape closes, backdrop click closes (except the startup home screen — only its own buttons navigate), focus lands inside; `role="listbox"`+`aria-selected` for tile/ramp pickers.
- Text contrast: `text-muted` only on `bg-app/panel/chip`, never over artwork.

## 8. Tailwind layout best practices (official-conventions binding)

- **Mobile-first**: base classes = phone, `lg:` = desktop. Never desktop-first with `max-lg` overrides for structural layout (cosmetic `max-md:` inside the top bar is allowed).
- **Spacing**: only the default 4px scale (v4 dynamic spacing covers halves like `p-2.5`, `h-4.5`); no `h-[37px]`-style magic when a scale value exists.
- **gap over margins**: flex/grid separation is `gap-*`; `space-x/space-y` and child margins for separation are violations (audit: zero `space-*` in the codebase — keep it zero).
- **Flex text**: a truncating child needs `min-w-0` + `truncate`; fixed-width icons/plates need `shrink-0`. Every flex child that overflows and breaks layout forgot one of these.
- **Arbitrary values policy**: `text-overline` (10px) and `text-label` (11px) are theme tokens (`@theme inline` in index.css) — never write `text-[10px]/[11px]` again. Remaining bracket values (`max-w-[88vw]`, `max-h-[85vh]`, `w-[168px]`) are measured one-offs; a bracket value that appears 3+ times must become an `@theme` token.
- **Focus**: one global `:focus-visible` outline lives in index.css — do not add per-component `focus:ring`/`focus:outline`; keep the existing `focus:border-accent-line` for inputs only.
- **Dialog width ladder**: `max-w-sm` (confirm) → `max-w-md` (create/project dialog) → `max-w-3xl` (projects catalog) → `max-w-4xl` (import). A new dialog picks the nearest rung.
- **Layered styling**: theme colors via `@theme inline` CSS variables (`--app/--panel/--raised/…`) → utilities (`bg-app`, `text-muted`…). Adding a theme color = add the variable in both `:root` and `[data-theme='light']` + one `@theme inline` line.

## 9. Hard rules (violation = change request)

1. No magic sizes — a number that is not in this file must reuse an existing measured value from the neighboring code.
2. No new z-index values outside the scale.
3. No raw colors outside canvas/logo.
4. No custom breakpoints; the structural switch is `lg` only.
5. Mobile = thumb-reach: tools bottom, navigation top, destructive far from canvas gestures.
6. Text in `ru.messages.ts` + `en.messages.ts` together — no unlabeled strings.
