import { describe, expect, it } from 'vitest'

import { mustHex } from './index.ts'
import {
  fillHandles,
  nearestHandle,
  pointInShape,
  shapeCenter,
  stopTicks,
  topLayerAt,
} from './index.ts'
import type { Paint, Shape, SvgScene } from './index.ts'

const rect = {
  kind: 'rect',
  cx: { x: 100, y: 100 },
  w: 40,
  h: 20,
  radius: 0,
  rotation: 0,
} as const

const star = {
  kind: 'star',
  cx: { x: 0, y: 0 },
  R: 100,
  r: 40,
  points: 5,
  rotation: 0,
} as const

describe('pointInShape', () => {
  it('hits rects with and without rotation', () => {
    expect(pointInShape(rect, { x: 100, y: 100 })).toBe(true)
    expect(pointInShape(rect, { x: 115, y: 95 })).toBe(true)
    expect(pointInShape(rect, { x: 130, y: 130 })).toBe(false)
    const rotated = { ...rect, rotation: 90 }
    // After a 90° rotation the 40-wide, 20-tall bar lies along y.
    expect(pointInShape(rotated, { x: 100, y: 115 })).toBe(true)
    expect(pointInShape(rotated, { x: 115, y: 100 })).toBe(false)
  })

  it('hits the concave star correctly (center in, notch out)', () => {
    expect(pointInShape(star, { x: 0, y: 0 })).toBe(true)
    expect(pointInShape(star, { x: 0, y: -90 })).toBe(true)
    // In the notch between two spikes, past the polygon boundary.
    expect(pointInShape(star, { x: 60, y: -60 })).toBe(false)
  })

  it('uses anchors for path shapes', () => {
    const tri: Shape = {
      kind: 'path',
      d: 'M0 0L100 0L0 100Z',
      anchors: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 0, y: 100 },
      ],
    }
    expect(pointInShape(tri, { x: 10, y: 10 })).toBe(true)
    expect(pointInShape(tri, { x: 90, y: 90 })).toBe(false)
  })
})

describe('fillHandles', () => {
  it('exposes both axis ends for linear paints', () => {
    const handles = fillHandles(rect, {
      kind: 'linear',
      p1: { x: 0, y: 0 },
      p2: { x: 10, y: 5 },
      stops: [],
      alpha: 1,
    })
    expect(handles.map((h) => h.id)).toEqual(['linear-p1', 'linear-p2'])
  })

  it('maps bbox-fraction radials through the shape bbox', () => {
    const handles = fillHandles(rect, {
      kind: 'radial',
      units: 'bbox',
      cx: 0.5,
      cy: 0.5,
      r: 0.25,
      fx: null,
      fy: null,
      stops: [],
      alpha: 1,
    })
    const rim = handles.find((h) => h.id === 'radial-rim')
    expect(rim?.at).toEqual({ x: 110, y: 100 })
  })

  it('adds a focus handle only when the focus is set', () => {
    const withFocus = fillHandles(rect, {
      kind: 'radial',
      units: 'user',
      cx: 0,
      cy: 0,
      r: 50,
      fx: 10,
      fy: -10,
      stops: [],
      alpha: 1,
    })
    expect(withFocus.map((h) => h.id)).toEqual(['radial-center', 'radial-rim', 'radial-focus'])
    const withoutFocus = fillHandles(rect, {
      kind: 'radial',
      units: 'user',
      cx: 0,
      cy: 0,
      r: 50,
      fx: null,
      fy: null,
      stops: [],
      alpha: 1,
    })
    expect(withoutFocus).toHaveLength(2)
  })
})

describe('nearestHandle', () => {
  it('picks the closest handle within tolerance', () => {
    const handles = [
      { id: 'radial-center' as const, at: { x: 0, y: 0 } },
      { id: 'radial-rim' as const, at: { x: 50, y: 0 } },
    ]
    expect(nearestHandle(handles, { x: 3, y: 0 }, 10)?.id).toBe('radial-center')
    expect(nearestHandle(handles, { x: 46, y: 0 }, 10)?.id).toBe('radial-rim')
    expect(nearestHandle(handles, { x: 25, y: 0 }, 10)).toBeNull()
  })
})

describe('topLayerAt', () => {
  const scene: SvgScene = {
    width: 200,
    height: 200,
    background: null,
    layers: [
      {
        id: 'a',
        name: 'A',
        visible: true,
        opacity: 1,
        shape: rect,
        fills: [{ kind: 'solid', color: mustHex('#000000'), alpha: 1 }],
      },
      {
        id: 'b',
        name: 'B',
        visible: false,
        opacity: 1,
        shape: { kind: 'rect', cx: { x: 100, y: 100 }, w: 80, h: 80, radius: 0, rotation: 0 },
        fills: [{ kind: 'solid', color: mustHex('#ffffff'), alpha: 1 }],
      },
    ],
  }
  it('returns the topmost visible hit', () => {
    expect(topLayerAt(scene, { x: 100, y: 100 })?.id).toBe('a')
  })
  it('ignores hidden layers and misses outside shapes', () => {
    expect(topLayerAt(scene, { x: 130, y: 130 })).toBeNull()
  })
  it('centers are bbox midpoints', () => {
    expect(shapeCenter(rect)).toEqual({ x: 100, y: 100 })
  })
})

describe('stopTicks', () => {
  it('places linear stops along the p1→p2 axis', () => {
    const paint: Paint = {
      kind: 'linear',
      p1: { x: 0, y: 0 },
      p2: { x: 100, y: 0 },
      stops: [
        { offset: 0, color: mustHex('#ffffff'), alpha: 1 },
        { offset: 0.5, color: mustHex('#808080'), alpha: 1 },
        { offset: 1, color: mustHex('#000000'), alpha: 1 },
      ],
      alpha: 1,
    }
    const ticks = stopTicks(rect, paint)
    expect(ticks[1]?.at).toEqual({ x: 50, y: 0 })
  })

  it('maps bbox radial stops through the shape box', () => {
    const paint: Paint = {
      kind: 'radial',
      units: 'bbox',
      cx: 0.5,
      cy: 0.5,
      r: 0.25,
      fx: null,
      fy: null,
      stops: [
        { offset: 0, color: mustHex('#ffffff'), alpha: 1 },
        { offset: 1, color: mustHex('#000000'), alpha: 1 },
      ],
      alpha: 1,
    }
    const ticks = stopTicks(rect, paint)
    // Rect bbox x 80..120: rim at fraction cx+r = 0.75 → x = 110.
    expect(ticks[1]?.at).toEqual({ x: 110, y: 100 })
  })
})
