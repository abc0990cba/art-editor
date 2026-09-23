# Proposal: add-light-theme

## Why

The editor UI is hardcoded dark: Tailwind classes and canvas colors embed fixed dark values.
Users working on light backgrounds (or in bright environments) need a light theme, and canvas
overlays (checkerboard, grid, guides) must stay readable in both themes.

## What Changes

- Introduce a semantic color-token system: CSS custom properties on `:root` (dark values) with
  a `[data-theme="light"]` override block, exposed to Tailwind v4 via `@theme inline` as
  utilities (`bg-app`, `bg-panel`, `text-body`, `text-muted`, `border-line`, `bg-raised`, …).
- Replace hardcoded dark classes across components (App, TopBar, ToolRail, SettingsPanel, ui
  primitives) with the semantic utilities; no visual change in the dark theme.
- Canvas-stage colors (checkerboard pair, grid lines, sub-grid lines, guides, hover highlight,
  canvas border) come from a theme object selected by the resolved theme.
- Add a theme preference — Dark / Light / Auto (follows `prefers-color-scheme`) — persisted in
  localStorage; `Auto` resolves reactively. The resolved theme is applied as `data-theme` on
  `<html>` and drives both the CSS variables and the canvas theme object.
- Theme switcher in the top bar (three-state segmented control), EN/RU labels.

## Capabilities

### Modified

- `i18n` — ADDED requirement: theme switcher labels.
- New capability `theming` — ADDED requirements: semantic theming of UI and canvas, persisted
  preference with Auto mode.

## Non-Goals

- Additional accent-color themes beyond dark/light
- Per-document (exported artwork) theming — exports keep explicit background settings
