# Tasks: add-light-theme

## 1. Tokens & state

- [x] 1.1 `index.css`: CSS variables for dark + light, `@theme inline` semantic utilities,
      themed `body`
- [x] 1.2 Stage theme object (`STAGE_THEMES`) with checker/grid/guide/hover/frame colors
- [x] 1.3 Store: `themePref` ('dark'|'light'|'auto'), persistence, `resolvedTheme` +
      `matchMedia` listener applying `data-theme`

## 2. UI sweep

- [x] 2.1 Replace hardcoded classes in `App`, `TopBar`, `ToolRail`, `SettingsPanel`, `ui.tsx`,
      `CanvasStage`
- [x] 2.2 `CanvasStage` draws overlays from `STAGE_THEMES[resolvedTheme]`
- [x] 2.3 TopBar theme switcher (Dark/Light/Auto) + i18n EN/RU

## 3. Tests & polish

- [x] 3.1 `theming.test.ts`: theme object invariants, auto-resolution, persistence
- [x] 3.2 Browser screenshots of both themes across panels; lint/tsc/vitest/build; archive
