# Tasks: add-canvas-scrollbars

## 1. Engine & UI

- [ ] 1.1 `src/engine/scrollbars.ts`: pure thumb/track metrics (visibility, scale, thumb size and clamped position)
- [ ] 1.2 `src/components/CanvasStage.tsx`: overlay bars with thumb drag and track-click panning, corner sharing, wrapper size tracking

## 2. Tests & polish

- [ ] 2.1 `src/engine/scrollbars.test.ts`: visibility, proportional thumb, min-thumb clamp, linear mapping and edge clamping
- [ ] 2.2 i18n aria-labels (EN/RU); `oxlint`, `tsc`, `vitest`, `build` green; browser smoke at high zoom
