# Proposal: add-rich-color-picker

## Why

Color selection currently relies on the native `<input type="color">` plus fixed swatch rows.
The native picker is OS-dependent, detached from the editor's look, and offers no direct control
over hue/saturation/brightness or quick access to previously used colors. A rich in-app picker —
with a radial color wheel as the centerpiece — gives precise, fast, cross-platform color control
that suits the radial/symmetric artwork the editor is built for.

## What Changes

- Add `src/engine/color.ts`: pure HSV↔RGB↔hex conversion utilities with normalization and
  validation.
- Add a `ColorPicker` component:
  - a **radial color wheel** (canvas-rendered): angle = hue, radius = saturation;
  - a **brightness (value) slider** alongside the wheel;
  - a **hex input** with live validation (3- and 6-digit forms);
  - a preview swatch comparing current vs picked color.
  Changes apply live to the active color while dragging.
- Add **recent colors**: the editor tracks recently used paint colors (deduplicated, newest
  first, capped) and shows them as a swatch row in the color panel; persisted in localStorage.
- Replace the native color input in the Color section with the picker toggle (a swatch button
  that expands the picker inline); other native inputs (background color) stay.

## Capabilities

### Modified

- New capability `color-picker` — ADDED requirements: radial wheel picking, hex entry, live
  updates, recent colors.
- `pixel-styling` — unchanged (the active-color model is untouched).

## Non-Goals

- Alpha/transparency per color (8-digit hex)
- Palette editing from the picker
- OS-level eyedropper API (the canvas eyedropper tool already exists)
