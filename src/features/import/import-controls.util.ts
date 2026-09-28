import type { CSSProperties } from 'react'

import type { ImportDither, ImportFit } from '../../engine/import-image.ts'

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
