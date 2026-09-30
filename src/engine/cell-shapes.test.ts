import { describe, expect, it } from 'vitest'

import {
  CELL_SHAPE_IDS,
  DEFAULT_SHAPE_PARAMS,
  cellShapeFragment,
  cellShapeHit,
  isCellShapeId,
  normalizeShapeParams,
  paramsOf,
  shapePreviewPath,
} from './cell-shapes.ts'
import type { CellShapeId, ShapeParams } from './cell-shapes.ts'

const X = 3
const Y = 7
const W = 5
const H = 4

const frag = (
  id: CellShapeId,
  p: ShapeParams = DEFAULT_SHAPE_PARAMS,
  radius = 0,
  chamfer = false,
  box?: { x: number; y: number; w: number; h: number },
) => cellShapeFragment({ id, ...(box ?? { x: X, y: Y, w: W, h: H }), params: p, radius, chamfer })

describe('cell shape registry', () => {
  it('every id exposes a closed non-empty fragment', () => {
    for (const id of CELL_SHAPE_IDS) {
      const d = frag(id)
      expect(d.startsWith('M'), id).toBe(true)
      expect(d.endsWith('Z'), id).toBe(true)
      expect(d.length, id).toBeGreaterThan(10)
    }
  })

  it('fragments stay inside the cell box when rotation is zero', () => {
    // polygon forms at radius 0 emit plain M/L coordinate pairs — arc flags would
    // break the naive x/y pairing below
    const polyIds = [
      'square',
      'triangle',
      'triangleDown',
      'diamond',
      'cross',
      'xCross',
      'star',
      'sparkle',
      'hexagon',
      'flower',
      'gear',
      'asterisk',
      'lightning',
      'chevron',
    ] as const
    for (const id of polyIds) {
      const d = frag(id, { ...DEFAULT_SHAPE_PARAMS, rotation: 0 })
      expect(d, id).not.toContain('A')
      const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
      expect(nums.length % 2, id).toBe(0)
      for (let i = 0; i < nums.length; i += 2) {
        expect(nums[i], `${id} x`).toBeGreaterThanOrEqual(X - 1e-9)
        expect(nums[i], `${id} x`).toBeLessThanOrEqual(X + W + 1e-9)
        expect(nums[i + 1], `${id} y`).toBeGreaterThanOrEqual(Y - 1e-9)
        expect(nums[i + 1], `${id} y`).toBeLessThanOrEqual(Y + H + 1e-9)
      }
    }
  })

  it('ring carries a hole: two subpaths like the evenodd fill expects', () => {
    expect(frag('ring').match(/M/g)).toHaveLength(2)
  })
})

describe('cell form geometry', () => {
  it('params change the geometry', () => {
    const star3 = frag('star', { ...DEFAULT_SHAPE_PARAMS, points: 3 }, 0, false, {
      x: 0,
      y: 0,
      w: 8,
      h: 8,
    })
    const star12 = frag('star', { ...DEFAULT_SHAPE_PARAMS, points: 12 }, 0, false, {
      x: 0,
      y: 0,
      w: 8,
      h: 8,
    })
    expect(star3).not.toBe(star12)
    const thin = frag('ring', { ...DEFAULT_SHAPE_PARAMS, thickness: 0.05 }, 0, false, {
      x: 0,
      y: 0,
      w: 8,
      h: 8,
    })
    const fat = frag('ring', { ...DEFAULT_SHAPE_PARAMS, thickness: 0.5 }, 0, false, {
      x: 0,
      y: 0,
      w: 8,
      h: 8,
    })
    expect(thin).not.toBe(fat)
    const rot = frag('triangle', { ...DEFAULT_SHAPE_PARAMS, rotation: 30 }, 0, false, {
      x: 0,
      y: 0,
      w: 8,
      h: 8,
    })
    const still = frag('triangle', DEFAULT_SHAPE_PARAMS, 0, false, { x: 0, y: 0, w: 8, h: 8 })
    expect(rot).not.toBe(still)
  })

  it('rotation 360° renders identically to 0°', () => {
    expect(frag('triangle', { ...DEFAULT_SHAPE_PARAMS, rotation: 0 })).toBe(
      frag('triangle', { ...DEFAULT_SHAPE_PARAMS, rotation: 360 }),
    )
  })

  it('radius rounds polygon corners but not curves', () => {
    const sharp = frag('hexagon', DEFAULT_SHAPE_PARAMS, 0, false, { x: 0, y: 0, w: 8, h: 8 })
    const round = frag('hexagon', DEFAULT_SHAPE_PARAMS, 0.5, false, { x: 0, y: 0, w: 8, h: 8 })
    expect(round).not.toBe(sharp)
    expect(round).toContain('A')
    const circle = frag('circle', DEFAULT_SHAPE_PARAMS, 0.5, false, { x: 0, y: 0, w: 8, h: 8 })
    const circleSharp = frag('circle', DEFAULT_SHAPE_PARAMS, 0, false, { x: 0, y: 0, w: 8, h: 8 })
    expect(circle).toBe(circleSharp)
  })

  it('chamfer replaces arcs with straight cuts', () => {
    const arc = frag('hexagon', DEFAULT_SHAPE_PARAMS, 0.5, false, { x: 0, y: 0, w: 8, h: 8 })
    const cut = frag('hexagon', DEFAULT_SHAPE_PARAMS, 0.5, true, { x: 0, y: 0, w: 8, h: 8 })
    expect(arc).toContain('A')
    expect(cut).not.toContain('A')
  })
})

describe('cell form hit tests', () => {
  it('center is inside every form except the ring hole; corners outside (except square)', () => {
    for (const id of CELL_SHAPE_IDS) {
      const centerInside = id !== 'ring'
      expect(cellShapeHit(id, 0.5, 0.5, DEFAULT_SHAPE_PARAMS), id).toBe(centerInside)
    }
    expect(cellShapeHit('square', 0.01, 0.01, DEFAULT_SHAPE_PARAMS)).toBe(true)
    for (const id of [
      'circle',
      'diamond',
      'star',
      'hexagon',
      'heart',
      'moon',
      'teardrop',
      'flower',
      'semicircle',
      'gear',
      'asterisk',
      'lightning',
      'chevron',
    ] as const) {
      expect(cellShapeHit(id, 0.01, 0.01, DEFAULT_SHAPE_PARAMS), id).toBe(false)
    }
  })

  it('ring wall thickness decides between center ink and hole', () => {
    expect(cellShapeHit('ring', 0.5, 0.5, DEFAULT_SHAPE_PARAMS)).toBe(false)
    expect(cellShapeHit('ring', 0.5, 0.04, DEFAULT_SHAPE_PARAMS)).toBe(true)
    expect(cellShapeHit('ring', 0.5, 0.5, { ...DEFAULT_SHAPE_PARAMS, thickness: 0.5 })).toBe(true)
  })

  it('rotation moves the silhouette with the form', () => {
    // (0.7, 0.8) sits in the lower-right body of the up-pointing triangle; flipped 180°
    // that region maps to the empty upper-left corner of the down-pointing one
    expect(cellShapeHit('triangle', 0.7, 0.8, DEFAULT_SHAPE_PARAMS)).toBe(true)
    expect(cellShapeHit('triangle', 0.7, 0.8, { ...DEFAULT_SHAPE_PARAMS, rotation: 180 })).toBe(
      false,
    )
    expect(cellShapeHit('triangle', 0.3, 0.2, { ...DEFAULT_SHAPE_PARAMS, rotation: 180 })).toBe(
      true,
    )
  })
})

describe('organic and graphic form geometry', () => {
  it('moon keeps the box center inked and always bites the tips chord', () => {
    for (const thickness of [0.05, 0.25, 0.5]) {
      const p = { ...DEFAULT_SHAPE_PARAMS, thickness }
      expect(cellShapeHit('moon', 0.3, 0.7, p), `ink at ${thickness}`).toBe(true)
      expect(cellShapeHit('moon', 0.75, 0.25, p), `bite at ${thickness}`).toBe(false)
    }
  })

  it('semicircle is a dome; rotation 180 flips the flat side up', () => {
    expect(cellShapeHit('semicircle', 0.5, 0.3, DEFAULT_SHAPE_PARAMS)).toBe(true)
    expect(cellShapeHit('semicircle', 0.5, 0.7, DEFAULT_SHAPE_PARAMS)).toBe(false)
    expect(cellShapeHit('semicircle', 0.5, 0.3, { ...DEFAULT_SHAPE_PARAMS, rotation: 180 })).toBe(
      false,
    )
    expect(cellShapeHit('semicircle', 0.5, 0.7, { ...DEFAULT_SHAPE_PARAMS, rotation: 180 })).toBe(
      true,
    )
  })

  it('chevron rotates around the center', () => {
    expect(cellShapeHit('chevron', 0.1, 0.8, DEFAULT_SHAPE_PARAMS)).toBe(true)
    expect(cellShapeHit('chevron', 0.1, 0.8, { ...DEFAULT_SHAPE_PARAMS, rotation: 180 })).toBe(
      false,
    )
  })

  it('flower petal count moves the silhouettes', () => {
    const probe: [number, number] = [0.725, 0.89] // angle 60°, radius 0.45
    expect(cellShapeHit('flower', probe[0], probe[1], { ...DEFAULT_SHAPE_PARAMS, points: 6 })).toBe(
      true,
    )
    expect(cellShapeHit('flower', probe[0], probe[1], { ...DEFAULT_SHAPE_PARAMS, points: 3 })).toBe(
      false,
    )
  })

  it('gear teeth open and close the gap between tips', () => {
    const probe: [number, number] = [0.573, 0.0865] // angle -80°, radius 0.42
    expect(cellShapeHit('gear', probe[0], probe[1], { ...DEFAULT_SHAPE_PARAMS, points: 8 })).toBe(
      false,
    )
    expect(cellShapeHit('gear', probe[0], probe[1], { ...DEFAULT_SHAPE_PARAMS, points: 4 })).toBe(
      true,
    )
  })

  it('asterisk arm count changes the silhouette', () => {
    const probe: [number, number] = [0.65, 0.2402] // angle -60°, radius 0.3
    expect(
      cellShapeHit('asterisk', probe[0], probe[1], { ...DEFAULT_SHAPE_PARAMS, points: 3 }),
    ).toBe(false)
    expect(
      cellShapeHit('asterisk', probe[0], probe[1], { ...DEFAULT_SHAPE_PARAMS, points: 12 }),
    ).toBe(true)
  })

  it('moon and semicircle are arc fragments, teardrop is cubic like the heart', () => {
    expect(frag('moon').match(/A/g)).toHaveLength(2)
    expect(frag('semicircle').match(/A/g)).toHaveLength(1)
    expect(frag('teardrop')).toContain('C')
    expect(frag('teardrop')).not.toContain('A')
  })

  it('params change the new-form fragments', () => {
    expect(frag('gear', { ...DEFAULT_SHAPE_PARAMS, points: 3 })).not.toBe(
      frag('gear', { ...DEFAULT_SHAPE_PARAMS, points: 12 }),
    )
    expect(frag('chevron', { ...DEFAULT_SHAPE_PARAMS, thickness: 0.05 })).not.toBe(
      frag('chevron', { ...DEFAULT_SHAPE_PARAMS, thickness: 0.5 }),
    )
  })
})

describe('shape params normalization', () => {
  it('clamps to the documented ranges', () => {
    expect(normalizeShapeParams({ thickness: 2, points: 100, rotation: 720 })).toEqual({
      thickness: 0.5,
      points: 12,
      rotation: 0,
    })
    expect(normalizeShapeParams({ thickness: 0, points: 1, rotation: -90 })).toEqual({
      thickness: 0.05,
      points: 3,
      rotation: 270,
    })
  })

  it('backfills garbage with defaults', () => {
    expect(normalizeShapeParams(undefined)).toEqual(DEFAULT_SHAPE_PARAMS)
    expect(normalizeShapeParams('junk')).toEqual(DEFAULT_SHAPE_PARAMS)
    expect(normalizeShapeParams({ points: Number.NaN })).toEqual({
      ...DEFAULT_SHAPE_PARAMS,
      points: 5,
    })
  })
})

describe('picker helpers', () => {
  it('id guard accepts exactly the registry ids', () => {
    expect(isCellShapeId('circle')).toBe(true)
    expect(isCellShapeId('blob')).toBe(false)
    expect(isCellShapeId(undefined)).toBe(false)
  })

  it('curved shapes expose no radius; every shape answers its params', () => {
    expect(paramsOf('star')).toEqual(['points', 'thickness', 'rotation'])
    expect(paramsOf('circle')).toEqual([])
    expect(paramsOf('blob' as never)).toEqual([])
  })

  it('preview icons stay valid for every shape', () => {
    for (const id of CELL_SHAPE_IDS) {
      const d = shapePreviewPath(id, 24)
      expect(d.startsWith('M'), id).toBe(true)
      expect(d.endsWith('Z'), id).toBe(true)
    }
  })
})
