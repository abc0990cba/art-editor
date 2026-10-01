import type { CSSProperties } from 'react'

import { hexToRgb } from '../../engine/color.ts'
import type { ImportDither, ImportFit, ImportResult } from '../../engine/import-image.ts'

/** Canvas placement options of the import, in display order. */
export const FITS: ImportFit[] = ['cover', 'contain', 'stretch', 'resize']

/** Chip-plate select trigger; phones get 44px touch targets (max-lg). */
export const SELECT_TRIGGER =
  'border-line bg-chip text-body dark:border-line dark:bg-chip h-auto w-full rounded-md px-2 py-1 text-xs max-lg:min-h-11 max-lg:px-3 max-lg:py-2.5 max-lg:text-sm'

export const DITHER_GROUPS: {
  label:
    | 'import.ditherGroup.off'
    | 'import.ditherGroup.ordered'
    | 'import.ditherGroup.diffusion'
    | 'import.ditherGroup.special'
    | 'import.ditherGroup.glyph'
  dithers: ImportDither[]
}[] = [
  { label: 'import.ditherGroup.off', dithers: ['none'] },
  {
    label: 'import.ditherGroup.ordered',
    dithers: [
      'bayer2',
      'bayer4',
      'bayer8',
      'bayer16',
      'cluster-dot',
      'halftone',
      'blue-noise',
      'void-cluster',
      'pattern',
      'crosshatch',
    ],
  },
  {
    label: 'import.ditherGroup.diffusion',
    dithers: [
      'floyd',
      'atkinson',
      'sierra',
      'sierra-lite',
      'stucki',
      'burkes',
      'jjn',
      'stevenson-arce',
      'nakano',
    ],
  },
  {
    label: 'import.ditherGroup.special',
    dithers: ['ostromoukhov', 'variable-error', 'dot-diffusion', 'riemersma'],
  },
  {
    label: 'import.ditherGroup.glyph',
    dithers: ['glyph', 'palette-glyph'],
  },
]

/** Checkerboard under transparent preview pixels. */
export const checkerStyle: CSSProperties = {
  backgroundImage:
    'conic-gradient(rgba(128,128,128,0.25) 25%, rgba(128,128,128,0.08) 0 50%, rgba(128,128,128,0.25) 0 75%, rgba(128,128,128,0.08) 0)',
  backgroundSize: '16px 16px',
}

/** Signed slider readout (-100..100 → «-12» / «+12»). */
export const signed = (v: number): string => (v > 0 ? `+${v}` : `${v}`)

export interface Rgb {
  r: number
  g: number
  b: number
}

/** Result palette hex → rgb lookup for the canvas painters. */
export function importRgbOf(palette: string[]): Map<string, Rgb> {
  const m = new Map<string, Rgb>()
  for (const hex of palette) m.set(hex, hexToRgb(hex) ?? { r: 0, g: 0, b: 0 })
  return m
}

/** Paint the converted cells at 1:1 (cols×sub, rows×sub); empty cells stay transparent. */
export function paintResult(
  ctx: CanvasRenderingContext2D,
  result: ImportResult,
  rgbOf: Map<string, Rgb>,
  sub: number,
): void {
  const w = result.cols * sub
  const h = result.rows * sub
  const img = ctx.createImageData(w, h)
  for (let i = 0; i < result.cells.length; i++) {
    const v = result.cells[i]
    if (v === 0) continue
    const rgb = rgbOf.get(result.palette[(v - 1) % result.palette.length])
    if (!rgb) continue
    img.data[i * 4] = rgb.r
    img.data[i * 4 + 1] = rgb.g
    img.data[i * 4 + 2] = rgb.b
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
}
