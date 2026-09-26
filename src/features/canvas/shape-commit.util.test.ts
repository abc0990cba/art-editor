import { describe, expect, it } from 'vitest'

import type { ToolOpts } from '../../state/tools.slice.ts'
import { shapeParametric } from './shape-commit.util.ts'

const toolOpts = {
  shapeCorner: 0,
  shapeBulge: 0,
  ellipsePower: 2,
} as unknown as ToolOpts

const base = {
  tool: 'concentric',
  isSquare: true,
  sub: 1,
  brushSize: 1,
  brushSnap: true,
  free: false,
  strokeOnly: true,
  singleColor: true,
  inkColor: '#e63946',
  start: [3, 4] as [number, number],
  last: [13, 14] as [number, number],
  concentricRadii: [1, 0.66, 0.33],
  toolOpts,
}

describe('shapeParametric', () => {
  it('stroke-only square-grid shapes commit as a parametric node with fill off', () => {
    const spec = shapeParametric(base)
    expect(spec?.op).toBe('source.shape')
    expect(spec?.params['fill']).toBe(false)
    // endpoints floor into buffer cells: 10.9 → 10, so the box spans 3..10
    const spec2 = shapeParametric({ ...base, start: [3.2, 4], last: [10.9, 14] })
    expect(spec2?.params['x']).toBe(3)
    expect(spec2?.params['w']).toBe(7)
  })

  it('a thick stroke nib cannot be regenerated: commits plain pixels instead', () => {
    expect(shapeParametric({ ...base, brushSize: 3 })).toBeUndefined()
    // the fill-only style paints no nib, so any brush size stays parametric
    expect(
      shapeParametric({ ...base, strokeOnly: false, singleColor: true, brushSize: 3 })?.op,
    ).toBe('source.shape')
  })

  it('custom concentric radii are not representable: plain pixels', () => {
    expect(shapeParametric({ ...base, concentricRadii: [1, 0.5] })).toBeUndefined()
  })

  it('non-square grids and multi-color strokes commit plain pixels', () => {
    expect(shapeParametric({ ...base, isSquare: false })).toBeUndefined()
    expect(shapeParametric({ ...base, singleColor: false })).toBeUndefined()
  })

  it('rect spans its inclusive box and carries the corner knobs', () => {
    const spec = shapeParametric({ ...base, tool: 'rect', strokeOnly: false })
    expect(spec).toEqual({
      op: 'source.rect',
      params: {
        color: '#e63946',
        fill: true,
        x: 3,
        y: 4,
        w: 11,
        h: 11,
        shapeCorner: 0,
        shapeBulge: 0,
      },
    })
  })

  it('degenerate ellipse and sub-3×3 shape drags stay plain pixels', () => {
    expect(
      shapeParametric({ ...base, tool: 'ellipse', start: [5, 5], last: [5, 5] }),
    ).toBeUndefined()
    expect(shapeParametric({ ...base, tool: 'star', start: [5, 5], last: [6, 6] })).toBeUndefined()
    // line is exact at any length
    expect(shapeParametric({ ...base, tool: 'line', start: [5, 5], last: [6, 6] })?.op).toBe(
      'source.line',
    )
  })
})
