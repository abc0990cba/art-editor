import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { DEFAULT_TRACE_PARAMS, normalizeTraceParams, TRACE_PRESETS } from './params.ts'

describe('normalizeTraceParams', () => {
  it('returns the defaults for null/undefined', () => {
    expect(normalizeTraceParams(null)).toEqual(DEFAULT_TRACE_PARAMS)
    expect(normalizeTraceParams(undefined)).toEqual(DEFAULT_TRACE_PARAMS)
  })

  it('clamps numeric ranges and unknown enum values', () => {
    const p = normalizeTraceParams({
      filterSpeckle: 999,
      colorPrecision: 0,
      layerDifference: -5,
      cornerThreshold: 400,
      mode: 'circle' as 'spline',
      tracer: 'magic' as 'outline',
    })
    expect(p.filterSpeckle).toBe(128)
    expect(p.colorPrecision).toBe(1)
    expect(p.layerDifference).toBe(0)
    expect(p.cornerThreshold).toBe(180)
    expect(p.mode).toBe('spline')
    expect(p.tracer).toBe('outline')
  })

  it('clamps the layer difference to the webapp range 0–255', () => {
    expect(normalizeTraceParams({ layerDifference: 999 }).layerDifference).toBe(255)
  })

  it('every built-in preset normalizes into a valid full parameter set', () => {
    for (const preset of TRACE_PRESETS) {
      const p = normalizeTraceParams(preset.params)
      expect(p.tracer).toBe(p.tracer === 'centerline' ? 'centerline' : 'outline')
      expect(Number.isFinite(p.filterSpeckle)).toBe(true)
    }
  })

  it('transcribes the six vtracer webapp sample configurations verbatim', () => {
    const byId = new Map(TRACE_PRESETS.map((p) => [p.id, p.params]))
    // [id, colorMode, speckle, precision, difference, mode, corner] — values from the
    // webapp's presetConfigs; every shared value (stacked, length 4, splice 45, precision 8)
    // equals the default.
    const expected = [
      ['vtTrain', 'binary', 4, 6, 16, 'spline', 60],
      ['vtCity', 'color', 4, 8, 25, 'spline', 60],
      ['vtTree', 'color', 4, 8, 28, 'spline', 60],
      ['vtDessert', 'color', 8, 7, 64, 'spline', 60],
      ['vtDog', 'color', 10, 8, 48, 'spline', 180],
      ['vtTank', 'color', 0, 8, 0, 'none', 180],
    ] as const
    for (const [id, colorMode, speckle, precision, difference, mode, corner] of expected) {
      const p = normalizeTraceParams(byId.get(id))
      expect(p.colorMode, id).toBe(colorMode)
      expect(p.filterSpeckle, id).toBe(speckle)
      expect(p.colorPrecision, id).toBe(precision)
      expect(p.layerDifference, id).toBe(difference)
      expect(p.mode, id).toBe(mode)
      expect(p.cornerThreshold, id).toBe(corner)
      expect(p.hierarchical, id).toBe('stacked')
      expect(p.lengthThreshold, id).toBe(4)
      expect(p.spliceThreshold, id).toBe(45)
      expect(p.pathPrecision, id).toBe(8)
    }
  })

  it('ships a bundled demo image for every webapp sample preset', () => {
    for (const preset of TRACE_PRESETS.filter((p) => p.id.startsWith('vt'))) {
      expect(preset.demo?.startsWith('/tracer/samples/'), preset.id).toBe(true)
      const file = fileURLToPath(new URL(`../../../public${preset.demo}`, import.meta.url))
      expect(existsSync(file), preset.demo).toBe(true)
    }
  })
})
