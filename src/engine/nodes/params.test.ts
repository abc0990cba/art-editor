import { describe, expect, it } from 'vitest'

import { boundsWithValue, paramBounds } from './params'
import type { NodeParamSpec } from './types'

const intSpec = (min: number, max: number, span?: 'x' | 'y' | 'size' | 'delta'): NodeParamSpec => ({
  kind: 'int',
  min,
  max,
  default: min,
  span,
})

describe('paramBounds', nonSpanBounds)

function nonSpanBounds() {
  it('returns the schema bounds untouched for unmarked params', () => {
    expect(paramBounds(intSpec(3, 12), { cols: 128, rows: 128 })).toEqual({ min: 3, max: 12 })
  })

  it('returns null for non-numeric specs', () => {
    expect(
      paramBounds({ kind: 'select', options: ['a'], default: 'a' }, { cols: 32, rows: 32 }),
    ).toBeNull()
  })
}

describe('paramBounds', canvasSpans)

function canvasSpans() {
  it('x span tracks the column count with 15% headroom', () => {
    // pad = ceil(128 * 0.15) = 20 → [-20, 148], intersected with the hard clamp
    expect(paramBounds(intSpec(0, 2048, 'x'), { cols: 128, rows: 96 })).toEqual({
      min: 0,
      max: 148,
    })
    expect(paramBounds(intSpec(-1024, 3072, 'x'), { cols: 128, rows: 96 })).toEqual({
      min: -20,
      max: 148,
    })
  })

  it('y span tracks the row count', () => {
    // pad = ceil(96 * 0.15) = 15 → [-15, 111]
    expect(paramBounds(intSpec(-2048, 2048, 'y'), { cols: 128, rows: 96 })).toEqual({
      min: -15,
      max: 111,
    })
  })

  it('size span reaches past the larger dimension, keeping the schema floor', () => {
    expect(paramBounds(intSpec(1, 2048, 'size'), { cols: 64, rows: 32 })).toEqual({
      min: 1,
      max: 74,
    })
    expect(paramBounds(intSpec(3, 2048, 'size'), { cols: 64, rows: 32 })).toEqual({
      min: 3,
      max: 74,
    })
  })

  it('delta span is symmetric around zero over the larger dimension', () => {
    expect(paramBounds(intSpec(-2048, 2048, 'delta'), { cols: 128, rows: 64 })).toEqual({
      min: -148,
      max: 148,
    })
  })

  it('never exceeds the hard schema clamp and never inverts', () => {
    // canvas range would be [0, 37] on a 32-col grid, hard max pulls it back
    expect(paramBounds(intSpec(0, 20, 'x'), { cols: 32, rows: 32 })).toEqual({ min: 0, max: 20 })
    // tiny canvas still leaves a usable range (min < max)
    const b = paramBounds(intSpec(1, 2048, 'size'), { cols: 1, rows: 1 })!
    expect(b.min).toBeLessThanOrEqual(b.max)
  })

  it('rounds float bounds to two decimals', () => {
    const spec: NodeParamSpec = { kind: 'number', min: -1024, max: 3072, default: 2, span: 'x' }
    const b = paramBounds(spec, { cols: 33, rows: 33 })!
    // pad = ceil(33 * 0.15) = 5 → integers here; use an odd fraction via a small grid
    const tiny = paramBounds(spec, { cols: 3, rows: 3 })!
    expect(Number.isInteger(b.max)).toBe(true)
    expect(tiny.max).toBe(Math.round(tiny.max * 100) / 100)
  })
}

describe('boundsWithValue', extendToValue)

function extendToValue() {
  it('extends the range so a stale value from a bigger canvas still displays', () => {
    expect(boundsWithValue({ min: 0, max: 37 }, 50)).toEqual({ min: 0, max: 50 })
    expect(boundsWithValue({ min: 0, max: 37 }, -5)).toEqual({ min: -5, max: 37 })
    expect(boundsWithValue({ min: 0, max: 37 }, 10)).toEqual({ min: 0, max: 37 })
  })
}
