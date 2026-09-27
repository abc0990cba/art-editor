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

  it('every built-in preset normalizes into a valid full parameter set', () => {
    for (const preset of TRACE_PRESETS) {
      const p = normalizeTraceParams(preset.params)
      expect(p.tracer).toBe(p.tracer === 'centerline' ? 'centerline' : 'outline')
      expect(Number.isFinite(p.filterSpeckle)).toBe(true)
    }
  })
})
