import { describe, expect, it } from 'vitest'

import { mustHex } from './index.ts'
import { dragHandle, rotateLayer, translateLayer, translatePathData } from './index.ts'
import type { SvgLayer } from './index.ts'

const rectLayer: SvgLayer = {
  id: 'r',
  name: 'R',
  visible: true,
  opacity: 1,
  shape: { kind: 'rect', cx: { x: 100, y: 100 }, w: 40, h: 20, radius: 4, rotation: 0 },
  fills: [{ kind: 'solid', color: mustHex('#ffffff'), alpha: 1 }],
}

const polyLayer: SvgLayer = {
  id: 'p',
  name: 'P',
  visible: true,
  opacity: 1,
  shape: {
    kind: 'poly',
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ],
  },
  fills: [],
}

describe('translateLayer', () => {
  it('moves parametric centers and polygon points', () => {
    const moved = translateLayer(rectLayer, 5, -7)
    expect(moved.shape.kind === 'rect' && moved.shape.cx).toEqual({ x: 105, y: 93 })
    const poly = translateLayer(polyLayer, 2, 3)
    expect(poly.shape.kind === 'poly' && poly.shape.points[0]).toEqual({ x: 2, y: 3 })
  })

  it('offsets path data coordinates and anchors together', () => {
    const blob: SvgLayer = {
      ...polyLayer,
      shape: {
        kind: 'path',
        d: 'M0 0C5 0 10 5 10 10L0 10Z',
        anchors: [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
        ],
      },
    }
    const moved = translateLayer(blob, 100, 200)
    expect(moved.shape.kind === 'path' && moved.shape.d).toBe(
      'M100 200C105 200 110 205 110 210L100 210Z',
    )
    expect(moved.shape.kind === 'path' && moved.shape.anchors[0]).toEqual({ x: 100, y: 200 })
  })
})

describe('rotateLayer', () => {
  it('accumulates parametric rotation around the own center', () => {
    const rotated = rotateLayer(rectLayer, 90)
    expect(rotated.shape.kind === 'rect' && rotated.shape.rotation).toBe(90)
    expect(rotated.shape.kind === 'rect' && rotated.shape.cx).toEqual({ x: 100, y: 100 })
  })

  it('rotates polygon points around the layer center', () => {
    const rotated = rotateLayer(polyLayer, 90)
    // BBox center (5, 5) is the pivot; the (0,0) corner orbits to (10, 0).
    expect(rotated.shape.kind === 'poly' && rotated.shape.points[0]?.x).toBeCloseTo(10, 5)
    expect(rotated.shape.kind === 'poly' && rotated.shape.points[0]?.y).toBeCloseTo(0, 5)
  })
})

describe('dragHandle', () => {
  const linearLayer: SvgLayer = {
    ...rectLayer,
    fills: [{ kind: 'linear', p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, stops: [], alpha: 1 }],
  }

  it('moves linear axis ends', () => {
    const moved = dragHandle(linearLayer, 0, 'linear-p2', { x: 50, y: 60 })
    const paint = moved.fills[0]
    expect(paint?.kind === 'linear' && paint.p2).toEqual({ x: 50, y: 60 })
  })

  it('updates user radial center, rim and focus in scene units', () => {
    const layer: SvgLayer = {
      ...rectLayer,
      fills: [
        {
          kind: 'radial',
          units: 'user',
          cx: 10,
          cy: 10,
          r: 20,
          fx: null,
          fy: null,
          stops: [],
          alpha: 1,
        },
      ],
    }
    const moved = dragHandle(layer, 0, 'radial-rim', { x: 40, y: 10 })
    expect(moved.fills[0]?.kind === 'radial' && moved.fills[0].r).toBe(30)
    const focused = dragHandle(moved, 0, 'radial-focus', { x: 5, y: 5 })
    expect(focused.fills[0]?.kind === 'radial' && focused.fills[0].fx).toBe(5)
  })

  it('converts bbox radial handles through the shape bbox fractions', () => {
    const layer: SvgLayer = {
      ...rectLayer,
      fills: [
        {
          kind: 'radial',
          units: 'bbox',
          cx: 0.5,
          cy: 0.5,
          r: 0.5,
          fx: null,
          fy: null,
          stops: [],
          alpha: 1,
        },
      ],
    }
    // Rect bbox: x 80..120 (w 40) — center drag to scene (90, 100) → fraction 0.25.
    const moved = dragHandle(layer, 0, 'radial-center', { x: 90, y: 100 })
    expect(moved.fills[0]?.kind === 'radial' && moved.fills[0].cx).toBeCloseTo(0.25, 5)
  })

  it('ignores out-of-range fill indexes', () => {
    expect(dragHandle(linearLayer, 5, 'linear-p2', { x: 1, y: 1 })).toBe(linearLayer)
  })
})

describe('translatePathData', () => {
  it('passes Z through and keeps command structure', () => {
    expect(translatePathData('M0 0L10 0Z', 1, 2)).toBe('M1 2L11 2Z')
  })
})
