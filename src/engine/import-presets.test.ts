import { describe, expect, it } from 'vitest'

import { DEFAULT_IMPORT_OPTIONS, ORDERED_DITHERS } from './import-image'
import { IMPORT_PRESETS } from './import-presets'
import { PALETTES } from './palettes.ts'

const VALID_DITHERS: ReadonlySet<string> = new Set([
  'none',
  ...ORDERED_DITHERS,
  'floyd',
  'atkinson',
  'sierra',
  'sierra-lite',
  'stucki',
  'burkes',
  'jjn',
  'stevenson-arce',
  'nakano',
  'ostromoukhov',
  'variable-error',
  'dot-diffusion',
  'riemersma',
])

const inRange = (v: number, lo: number, hi: number) => v >= lo && v <= hi

describe('import presets', () => {
  it('has unique ids with valid option values', () => {
    const ids = new Set<string>()
    for (const p of IMPORT_PRESETS) {
      expect(ids.has(p.id), p.id).toBe(false)
      ids.add(p.id)
      const o = p.opts
      expect(VALID_DITHERS.has(o.dither), p.id).toBe(true)
      expect(inRange(o.ditherStrength, 0, 100), p.id).toBe(true)
      expect(inRange(o.threshold, 0, 255), p.id).toBe(true)
      expect(inRange(o.brightness, -100, 100), p.id).toBe(true)
      expect(inRange(o.contrast, -100, 100), p.id).toBe(true)
      expect(inRange(o.saturation, -100, 100), p.id).toBe(true)
      expect(inRange(o.pixelScale, 1, 4), p.id).toBe(true)
      expect(inRange(o.blur, 0, 10), p.id).toBe(true)
      expect(inRange(o.sharpen, 0, 100), p.id).toBe(true)
      expect(inRange(o.hue, -180, 180), p.id).toBe(true)
      expect(inRange(o.preDenoise, 0, 5), p.id).toBe(true)
      expect(inRange(o.preSmooth, 0, 5), p.id).toBe(true)
      expect(inRange(o.postDenoise, 0, 5), p.id).toBe(true)
      expect(inRange(o.postSmooth, 0, 5), p.id).toBe(true)
      expect(inRange(o.glowRadius, 0, 24), p.id).toBe(true)
      expect(inRange(o.glowIntensity, 0, 100), p.id).toBe(true)
      expect(inRange(o.aberration, 0, 12), p.id).toBe(true)
      expect(inRange(o.blend, 0, 100), p.id).toBe(true)
    }
  })

  it('references built-in palettes that exist', () => {
    const ids = new Set(PALETTES.map((p) => p.id))
    for (const p of IMPORT_PRESETS) {
      if (!p.paletteId) continue
      expect(ids.has(p.paletteId), p.id).toBe(true)
      expect(p.opts.palette.kind, p.id).toBe('preset')
      if (p.opts.palette.kind === 'preset') {
        expect(p.opts.palette.colors.length, p.id).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('every preset differs from the defaults', () => {
    for (const p of IMPORT_PRESETS) {
      const changed = (
        Object.keys(DEFAULT_IMPORT_OPTIONS) as (keyof typeof DEFAULT_IMPORT_OPTIONS)[]
      ).some((k) => JSON.stringify(p.opts[k]) !== JSON.stringify(DEFAULT_IMPORT_OPTIONS[k]))
      expect(changed, p.id).toBe(true)
    }
  })
})
