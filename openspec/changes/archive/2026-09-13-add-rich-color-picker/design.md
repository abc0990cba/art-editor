# Design: add-rich-color-picker

## Color math (`src/engine/color.ts`)

Pure utilities, unit-tested:

- `hsvToRgb(h, s, v) → {r, g, b}` (h in degrees, s/v in 0..1) — standard hue-six-sector formula.
- `rgbToHsv(r, g, b) → {h, s, v}`.
- `hsvToHex(h, s, v) → '#rrggbb'` and `hexToRgb(hex) → {r,g,b} | null` (accepts `#rgb`/`#rrggbb`,
  case-insensitive, returns null on garbage).
- `hexToHsv(hex) → {h, s, v}` (null-safe wrapper).

## Component (`src/components/ColorPicker.tsx`)

- Props: `{ color: string; onChange: (hex: string) => void }`. Internal HSV state is the source
  of truth during interaction; when the incoming `color` prop changes from outside (palette
  swatch, eyedropper) the HSV state re-derives via `hexToHsv`.
- Wheel: 148×148 canvas. Per-pixel render (ImageData): hue = angle, saturation = distance/radius,
  value from the slider; pixels beyond the radius are transparent. Redrawn on value change only.
- Marker: a small ring at `(hue, sat·R)` positioned by absolute transform.
- Pointer handling: `setPointerCapture`; drag computes angle/radius from the wheel center
  (radius clamped), updates HSV live, emits `onChange(hsvToHex(...))`.
- Value slider: 148×14 canvas with a gradient from black to `hsv(h, s, 1)`; drag sets `v`.
- Hex field: local text state; on valid `normalizeHex` commit → HSV update + `onChange`; invalid
  input leaves the color untouched and shows the field's error border.
- Panel integration: in the Color section, the current-color swatch becomes a button that toggles
  the picker inline (expands below the swatch rows). The background-color input keeps the native
  control.

## Recent colors

Store UI slice: `recent: string[]` + `pushRecent(hex)` (normalize, dedupe case-insensitively,
front-insert, cap 12, persist to `glyph.recent`). `paintCells` (non-erase, non-empty color) and
`fillAt` call `pushRecent`. The panel renders a Recent swatch row (highlighting when it equals
the active color) above the document palette.

## Testing

`color.test.ts`: rgb↔hsv round trips on representative colors (red, lime, black, white, grays,
`#e63946`), hex parsing (3/6 digit, invalid → null), hex formatting lowercase. UI verified in the
browser: drag updates live, hex commit, recent colors persist.
