import { describe, expect, it } from 'vitest'

import type { ImportBitmap } from '../import/index.ts'
import { fitRegionLayers } from './layers.ts'
import { fitRegion } from './model-select.ts'
import type { GradientParams } from './params.ts'
import { traceGradientImage } from './pipeline.ts'
import { evaluateFit } from './render.ts'
import { addSpot, fieldToPixels, linearField, quantize8, radialField } from './synth.util.ts'
import { DEFAULT_FIT_OPTIONS, type GradStop, type RgbField } from './types.ts'

const STOPS: GradStop[] = [
  { offset: 0, color: { r: 0.9, g: 0.2, b: 0.15 } },
  { offset: 0.5, color: { r: 0.95, g: 0.85, b: 0.25 } },
  { offset: 1, color: { r: 0.2, g: 0.55, b: 0.8 } },
]

const SINGLE: GradientParams = {
  mode: 'single',
  deltaETolerance: 2,
  maxStops: 6,
  maxLayers: 0,
  colorPrecision: 3,
  minRegion: 24,
  smoothnessDE: 8,
}

const STACKED: GradientParams = { ...SINGLE, mode: 'stacked', maxLayers: 8 }

function toBitmap(f: RgbField): ImportBitmap {
  const data = new Uint8ClampedArray(f.width * f.height * 4).fill(255)
  for (let i = 0; i < f.width * f.height; i++) {
    data[i * 4] = Math.round(f.rgb[i * 3] * 255)
    data[i * 4 + 1] = Math.round(f.rgb[i * 3 + 1] * 255)
    data[i * 4 + 2] = Math.round(f.rgb[i * 3 + 2] * 255)
  }
  return { width: f.width, height: f.height, data }
}

/** Diagonal gradient scene with one bright soft spot on top — the canonical layered case. */
function sceneWithSpot(): RgbField {
  const size = 72
  const base = linearField(size, size, { x: 0, y: 0 }, { x: size * 0.85, y: size * 0.6 }, STOPS)
  return addSpot(base, { x: 22, y: 26 }, 11, { r: 0.98, g: 0.97, b: 0.9 }, (t) => 1 - t)
}

describe('traceGradientImage', () => {
  it('upgrades a radial gradient scene to gradient fills', () => {
    const field = quantize8(radialField(64, 64, { x: 30, y: 34 }, 90, STOPS))
    const { svg, stats } = traceGradientImage(toBitmap(field), SINGLE)
    expect(stats.regions).toBeGreaterThanOrEqual(1)
    expect(stats.gradients).toBeGreaterThanOrEqual(1)
    expect(svg).toContain('radialGradient')
    expect(stats.meanDE).toBeLessThanOrEqual(3)
  })

  it('stacked mode absorbs a spot with a layer and lowers the error', () => {
    const bitmap = toBitmap(quantize8(sceneWithSpot()))
    const single = traceGradientImage(bitmap, SINGLE)
    const stacked = traceGradientImage(bitmap, STACKED)
    expect(stacked.stats.layers).toBeGreaterThanOrEqual(1)
    expect(stacked.stats.meanDE).toBeLessThan(single.stats.meanDE)
    expect(stacked.svg).toContain('stop-opacity')
  })

  it('keeps flat colors for regions below minRegion and builds a demap', () => {
    const bitmap = toBitmap(quantize8(sceneWithSpot()))
    const { svg, stats, demap } = traceGradientImage(bitmap, { ...SINGLE, minRegion: 10000 })
    expect(stats.regions).toBe(0)
    expect(svg).not.toContain('Gradient')
    expect(demap.width).toBe(Math.ceil(bitmap.width / 4))
    expect(demap.height).toBe(Math.ceil(bitmap.height / 4))
  })
})

describe('fitRegionLayers', () => {
  it('finds the spot the base fit missed and improves the composite', () => {
    const field = quantize8(sceneWithSpot())
    const pixels = fieldToPixels(field)
    const base = fitRegion(pixels, DEFAULT_FIT_OPTIONS, field).fit
    const before = evaluateFit(base, pixels).mean
    const layered = fitRegionLayers(pixels, base, { ...DEFAULT_FIT_OPTIONS, maxLayers: 6 })
    expect(layered.layers.length).toBeGreaterThanOrEqual(1)
    expect(layered.error.mean).toBeLessThan(before)
    for (const s of layered.layers) {
      expect(s.alpha[s.alpha.length - 1].color.r).toBe(0)
    }
  })
})
