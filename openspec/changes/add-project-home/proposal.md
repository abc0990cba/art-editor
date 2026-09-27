# Proposal: add-project-home

## Why

The app currently conflates app-level navigation with a drawing-mode flag: "pixel vs vector" is a
global toggle (localStorage `glyph.mode`), the vector tracer lives in a single unnamed autosave slot
(`vectorJobs['current']`) outside the project library, and after a reload the user lands on a canvas
overlay instead of a conventional entry point. Users expect the Fresco / Affinity / Figma model:
the app starts at a home gallery of projects, each project owns its workspace type, work is saved
ambiently, and an open project survives a page reload.

## What Changes

- **Home screen** becomes the app's start surface: a "Continue" card for the last opened project and
  a grid of project cards (type badge, canvas size, update date) with open / rename / duplicate /
  delete, plus a creation flow that asks for the project type first (pixel document or vector trace).
- **Typed projects**: `ProjectEntry` becomes a discriminated union with `kind: 'pixel' | 'vector'`.
  Vector entries store the trace session (source bitmap, params, svg, stats) — promoting the vector
  tracer from a single slot to real library projects.
- **URL routing** (TanStack Router, code-based routes): `/` renders home, `/p/$projectId` renders the
  editor whose workspace is derived from the project kind. A reload inside a project reopens it
  (Figma convention); an unknown id falls back to home; view-level UI state (panel collapsed, node
  editor mode/split) moves to typed search params written with `replace`.
- **Ambient saving**: autosave writes into the bound project entry (thumbnail re-render throttled and
  on exit); the explicit Save button is removed; Ctrl+S forces an immediate write; a `pagehide`
  flush closes the debounce loss window.
- **Top bar**: a home button (leftmost) replaces the folder button; the global Pixel/Vector mode
  switch is removed — the open project's kind drives which workspace fills the app.
- **One-time migration**: legacy pixel autosave becomes a draft pixel project, the legacy vector job
  becomes a vector project, `glyph.mode` is dropped.

## Capabilities

### Modified

- `project-library`: typed entries, home screen replaces the gallery dialog, creation flow with type
  choice, canvas-replacement guard superseded by view-based navigation.
- `persistence`: autosave targets the bound project entry (both kinds), flush on pagehide, reload
  restores the open project.

### Added

- `app-routing`: URL routes as the source of truth for which surface is visible, reload semantics,
  and typed search params for view state.

## Non-Goals

- Cloud sync or cross-device links (the URL carries only local state).
- Folders, tags or search inside the gallery.
- Converting traced SVG back into pixel-document layers (vector-to-pixel path).
- SSR / SEO — the app remains a pure SPA (static hosting needs a one-line SPA fallback).
