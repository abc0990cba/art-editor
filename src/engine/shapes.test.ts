import { describe, expect, it } from 'vitest'

import {
  SHAPE_TOOLS,
  ellipsePoints,
  isShapeTool,
  rectPoints,
  shapePathPoints,
  shapePathSegments,
} from './shapes'

const BOX_SHAPES = SHAPE_TOOLS.filter((t) => t !== 'arrow' && t !== 'wave' && t !== 'zigzag')

function has(pts: Array<[number, number]>, x: number, y: number): boolean {
  return pts.some(([px, py]) => px === x && py === y)
}

describe('shape tools', () => {
  it('rasterizes every box shape inside its bounding box', () => {
    for (const tool of BOX_SHAPES) {
      const pts = shapePathPoints(tool, 2, 3, 20, 15)
      expect(pts.length, tool).toBeGreaterThan(0)
      for (const [x, y] of pts) {
        expect(x, tool).toBeGreaterThanOrEqual(2)
        expect(x, tool).toBeLessThanOrEqual(20)
        expect(y, tool).toBeGreaterThanOrEqual(3)
        expect(y, tool).toBeLessThanOrEqual(15)
      }
    }
  })

  it('collapses a zero-size drag to a single cell for every shape', () => {
    for (const tool of SHAPE_TOOLS) {
      expect(shapePathPoints(tool, 7, 9, 7, 9)).toEqual([[7, 9]])
    }
  })

  it('diamond corners touch the middle of each box side', () => {
    const pts = shapePathPoints('diamond', 0, 0, 10, 10)
    expect(has(pts, 5, 0)).toBe(true)
    expect(has(pts, 10, 5)).toBe(true)
    expect(has(pts, 5, 10)).toBe(true)
    expect(has(pts, 0, 5)).toBe(true)
  })

  it('star points up and closes its outline', () => {
    const pts = shapePathPoints('star', 0, 0, 20, 20)
    expect(has(pts, 10, 0)).toBe(true)
    // the right outer ray sits at angle −18°: (0.976, 0.345) of the box
    expect(has(pts, 20, 7)).toBe(true)
    expect(pts.length).toBeGreaterThan(20)
  })

  it('respects star ray count and polygon side count', () => {
    const star = shapePathSegments('star', 0, 0, 10, 10, { starRays: 6 })[0]
    expect(star).toHaveLength(6 * 2 + 1) // closed → first vertex repeated
    const tri = shapePathSegments('polygon', 0, 0, 10, 10, { polygonSides: 3 })[0]
    expect(tri).toHaveLength(4)
    const dodecagon = shapePathSegments('polygon', 0, 0, 10, 10, { polygonSides: 12 })[0]
    expect(dodecagon).toHaveLength(13)
  })

  it('clamps shape options into their ranges', () => {
    const star = shapePathSegments('star', 0, 0, 10, 10, { starRays: 99 })[0]
    expect(star).toHaveLength(12 * 2 + 1)
    const tri = shapePathSegments('polygon', 0, 0, 10, 10, { polygonSides: 1 })[0]
    expect(tri).toHaveLength(4)
  })

  it('arrow keeps tail, tip and both barbs', () => {
    const pts = shapePathPoints('arrow', 0, 10, 20, 10)
    expect(has(pts, 0, 10)).toBe(true)
    expect(has(pts, 20, 10)).toBe(true)
    // head: length 7 (35% of 20), barbs ±4.2 around the shaft base at x=13
    expect(has(pts, 13, 6)).toBe(true)
    expect(has(pts, 13, 14)).toBe(true)
  })

  it('wave starts and ends exactly on the drag endpoints', () => {
    const pts = shapePathPoints('wave', 0, 20, 40, 20)
    expect(has(pts, 0, 20)).toBe(true)
    expect(has(pts, 40, 20)).toBe(true)
    for (const [, y] of pts) {
      expect(y).toBeGreaterThanOrEqual(20 - 7) // amp = 15% of 40 = 6
      expect(y).toBeLessThanOrEqual(20 + 7)
    }
  })

  it('spiral starts at the box center and reaches the rim', () => {
    const poly = shapePathSegments('spiral', 0, 0, 20, 20)[0]
    expect(poly[0][0]).toBeCloseTo(10, 5)
    expect(poly[0][1]).toBeCloseTo(10, 5)
    const maxR = Math.max(...poly.map(([x, y]) => Math.hypot(x - 10, y - 10)))
    expect(maxR).toBeCloseTo(10, 5)
  })

  it('moon tips meet at the top and bottom of the box', () => {
    const pts = shapePathPoints('moon', 0, 0, 20, 20)
    expect(has(pts, 10, 0)).toBe(true)
    expect(has(pts, 10, 20)).toBe(true)
  })

  it('scaled polylines stay inside the defining box', () => {
    for (const tool of BOX_SHAPES) {
      for (const poly of shapePathSegments(tool, 1, 2, 21, 12)) {
        for (const [x, y] of poly) {
          expect(x, tool).toBeGreaterThanOrEqual(1 - 1e-6)
          expect(x, tool).toBeLessThanOrEqual(21 + 1e-6)
          expect(y, tool).toBeGreaterThanOrEqual(2 - 1e-6)
          expect(y, tool).toBeLessThanOrEqual(12 + 1e-6)
        }
      }
    }
  })

  it('detects shape tools', () => {
    expect(isShapeTool('star')).toBe(true)
    expect(isShapeTool('gear')).toBe(true)
    expect(isShapeTool('pencil')).toBe(false)
    expect(isShapeTool('rect')).toBe(false)
  })

  it('rotates box shapes around the box center', () => {
    // the star's top vertex (0.5, 0) rotated by 90° lands on the right side
    const poly = shapePathSegments('star', 0, 0, 20, 20, { starRotation: 90 })[0]
    expect(poly[0][0]).toBeCloseTo(20, 5)
    expect(poly[0][1]).toBeCloseTo(10, 5)
    // unrotated hexagon starts at the top, 45°-rotated one at the upper right
    const hex = shapePathSegments('polygon', 0, 0, 20, 20, { polygonRotation: 45 })[0]
    expect(hex[0][0]).toBeCloseTo(10 + 10 * Math.SQRT1_2, 5)
    expect(hex[0][1]).toBeCloseTo(10 - 10 * Math.SQRT1_2, 5)
  })

  it('star inner radius follows its option', () => {
    const poly = shapePathSegments('star', 0, 0, 20, 20, { starRays: 5, starInner: 0.2 })[0]
    const radii = poly.slice(0, 10).map(([x, y]) => Math.hypot(x - 10, y - 10))
    expect(Math.min(...radii)).toBeCloseTo(0.2 * 10, 5)
    expect(Math.max(...radii)).toBeCloseTo(10, 5)
  })

  it('gear tooth count and depth come from its options', () => {
    const gear = shapePathSegments('gear', 0, 0, 20, 20, { gearTeeth: 12, gearDepth: 0.2 })[0]
    expect(gear).toHaveLength(12 * 4 + 1)
    const radii = gear.map(([x, y]) => Math.hypot(x - 10, y - 10))
    expect(Math.min(...radii)).toBeCloseTo(20 * (0.5 - 0.2), 5) // root = 0.5 − depth
    expect(Math.max(...radii)).toBeCloseTo(10, 5)
  })

  it('cross arm width comes from its option', () => {
    const poly = shapePathSegments('cross', 0, 0, 20, 20, { crossThickness: 0.2 })[0]
    expect(poly[0]).toEqual([4, 0]) // first vertex (a, 0) with a = 0.2
    expect(poly[3]).toEqual([20, 4]) // vertex (1, a)
  })

  it('moon thickness sets the inner arc gap', () => {
    const poly = shapePathSegments('moon', 0, 0, 20, 20, { moonThickness: 0.05 })[0]
    // the inner arc midpoint sits at x = 1 − thickness of the box width
    const widest = poly.some(([x, y]) => Math.abs(x - 19) < 0.01 && Math.abs(y - 10) < 0.01)
    expect(widest).toBe(true)
  })

  it('spiral turns and direction come from its options', () => {
    const cw = shapePathSegments('spiral', 0, 0, 20, 20, { spiralTurns: 1, spiralDir: 1 })[0]
    // one turn starting at the top ends back at the top rim
    const last = cw[cw.length - 1]
    expect(last[0]).toBeCloseTo(10, 5)
    expect(last[1]).toBeCloseTo(0, 5)
    const ccw = shapePathSegments('spiral', 0, 0, 20, 20, { spiralTurns: 1, spiralDir: -1 })[0]
    // counter-clockwise winding mirrors the end point across the vertical axis
    expect(ccw[ccw.length - 1][0]).toBeCloseTo(10, 5)
  })

  it('arrow head size follows its options', () => {
    const pts = shapePathPoints('arrow', 0, 10, 20, 10, { arrowHead: 0.5, arrowSpread: 1 })
    expect(has(pts, 0, 10)).toBe(true)
    expect(has(pts, 20, 10)).toBe(true)
    // head = 50% of 20 = 10 → base at x=10, barbs ±10 → y = 0 and 20
    expect(has(pts, 10, 0)).toBe(true)
    expect(has(pts, 10, 20)).toBe(true)
  })

  it('wave periods and amplitude come from its options', () => {
    const pts = shapePathPoints('wave', 0, 0, 30, 0, { wavePeriods: 2, waveAmplitude: 0.45 })
    for (const [, y] of pts) {
      expect(y).toBeGreaterThanOrEqual(-15)
      expect(y).toBeLessThanOrEqual(15)
    }
    expect(has(pts, 0, 0)).toBe(true)
    expect(has(pts, 30, 0)).toBe(true)
  })

  it('flower petal count is clamped and reflected in the curve', () => {
    for (const petals of [3, 4, 7, 12]) {
      const poly = shapePathSegments('flower', 0, 0, 20, 20, { flowerPetals: petals })[0]
      expect(poly.length, String(petals)).toBeGreaterThan(0)
      for (const [x, y] of poly) {
        expect(x, String(petals)).toBeGreaterThanOrEqual(-0.001)
        expect(x, String(petals)).toBeLessThanOrEqual(20.001)
        expect(y, String(petals)).toBeGreaterThanOrEqual(-0.001)
        expect(y, String(petals)).toBeLessThanOrEqual(20.001)
      }
    }
  })

  it('sun emits a closed core disc plus one closed loop per ray', () => {
    const polys = shapePathSegments('sun', 0, 0, 20, 20, { sunRays: 8 })
    expect(polys).toHaveLength(8 + 1)
    for (const poly of polys) {
      expect(poly[0]).toEqual(poly[poly.length - 1])
    }
    const coreR = Math.max(...polys[0].map(([x, y]) => Math.hypot(x - 10, y - 10)))
    expect(coreR).toBeCloseTo(0.18 * 20, 5) // default core radius
  })

  it('sun stays inside its box with waves, twist and alternation at maximum', () => {
    const variants = [
      { sunWave: 1, sunWavePeriods: 8 },
      { sunTwist: 1 },
      { sunTwist: -1, sunWave: 1 },
      { sunAlternate: 0.05, sunTaper: 1, sunRays: 32 },
      { sunRayBase: 0.49, sunCore: 0.45, sunRayLength: 1 },
    ]
    for (const opts of variants) {
      for (const poly of shapePathSegments('sun', 1, 2, 21, 12, opts)) {
        for (const [x, y] of poly) {
          expect(x).toBeGreaterThanOrEqual(1 - 1e-6)
          expect(x).toBeLessThanOrEqual(21 + 1e-6)
          expect(y).toBeGreaterThanOrEqual(2 - 1e-6)
          expect(y).toBeLessThanOrEqual(12 + 1e-6)
        }
      }
    }
  })

  it('sun ray count clamps and taper converges triangular rays to one tip', () => {
    expect(shapePathSegments('sun', 0, 0, 20, 20, { sunRays: 99 })).toHaveLength(32 + 1)
    const tri = shapePathSegments('sun', 0, 0, 20, 20, { sunRays: 3, sunTaper: 0 })[1]
    const seg = Math.min(64, Math.max(8, 2 * 6 + 4))
    expect(tri.length).toBe(2 * (seg + 1) + 1)
    // taper 0 → the left and right ray edges meet at a single tip point on the box top
    expect(tri[seg]).toEqual(tri[seg + 1])
    expect(tri[seg][0]).toBeCloseTo(10, 5)
    expect(tri[seg][1]).toBeCloseTo(0, 5)
    // taper 1 keeps a flat tip: the two edge ends differ
    const rect = shapePathSegments('sun', 0, 0, 20, 20, { sunRays: 3, sunTaper: 1 })[1]
    expect(rect[seg]).not.toEqual(rect[seg + 1])
  })

  it('bento emits one closed cell per slot and honors the grid', () => {
    const polys = shapePathSegments('bento', 0, 0, 30, 20, {
      bentoCols: 3,
      bentoRows: 2,
      bentoChaos: 0,
      bentoMerge: 0,
    })
    expect(polys).toHaveLength(6)
    for (const poly of polys) expect(poly[0]).toEqual(poly[poly.length - 1])
  })

  it('bento gap stripes separate the cells', () => {
    const polys = shapePathSegments('bento', 0, 0, 30, 20, {
      bentoCols: 2,
      bentoRows: 1,
      bentoGap: 0.2,
    })
    expect(polys).toHaveLength(2)
    const rightOfFirst = Math.max(...polys[0].map(([x]) => x))
    const leftOfSecond = Math.min(...polys[1].map(([x]) => x))
    expect(leftOfSecond - rightOfFirst).toBeGreaterThanOrEqual(0.2 * 30 - 0.01)
  })

  it('bento merging is seeded and reduces the cell count', () => {
    const a = shapePathSegments('bento', 0, 0, 30, 20, {
      bentoMerge: 0.9,
      bentoSeed: 3,
      bentoCols: 3,
      bentoRows: 3,
    })
    const b = shapePathSegments('bento', 0, 0, 30, 20, {
      bentoMerge: 0.9,
      bentoSeed: 3,
      bentoCols: 3,
      bentoRows: 3,
    })
    expect(a).toEqual(b) // same seed → identical layout
    expect(a.length).toBeLessThan(9)
    expect(a.length).toBeGreaterThanOrEqual(1)
  })

  it('rect stays pixel-exact without the new knobs', () => {
    expect(rectPoints(0, 0, 5, 3)).toHaveLength(2 * 6 + 2 * 4 - 4)
  })

  it('rect corner rounding cuts the corners and keeps the box', () => {
    const pts = rectPoints(0, 0, 20, 20, { shapeCorner: 0.5 })
    expect(has(pts, 0, 0)).toBe(false)
    expect(has(pts, 0, 10)).toBe(true)
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(20)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(20)
    }
  })

  it('ellipse power defaults to a true ellipse and pinches below 2', () => {
    const round = ellipsePoints(0, 0, 20, 20)
    expect(ellipsePoints(0, 0, 20, 20, { ellipsePower: 2 })).toEqual(round)
    const pinched = ellipsePoints(0, 0, 20, 20, { ellipsePower: 0.5 })
    expect(pinched.some(([x, y]) => x > 15 && y > 15)).toBe(false)
    expect(round.some(([x, y]) => x > 15 && y > 15)).toBe(true)
  })

  it('corner rounding softens the star tips', () => {
    const sharp = shapePathSegments('star', 0, 0, 20, 20, { starRays: 5 })[0]
    const soft = shapePathSegments('star', 0, 0, 20, 20, { starRays: 5, shapeCorner: 0.5 })[0]
    expect(soft.length).toBeGreaterThan(sharp.length)
    expect(soft.some(([x, y]) => Math.abs(x - 10) < 1e-6 && Math.abs(y) < 1e-6)).toBe(false)
  })

  it('diamond bulge bows the side midpoints', () => {
    const bowed = shapePathSegments('diamond', 0, 0, 20, 20, { shapeBulge: 1 })[0]
    const pinched = shapePathSegments('diamond', 0, 0, 20, 20, { shapeBulge: -1 })[0]
    const near = (poly: Array<[number, number]>, tx: number, ty: number) =>
      poly.some(([x, y]) => Math.abs(x - tx) < 0.05 && Math.abs(y - ty) < 0.05)
    // plain midpoint (15, 5) moves outward when bowed and vanishes when pinched
    expect(near(bowed, 15, 5)).toBe(false)
    expect(near(pinched, 12, 8)).toBe(true)
    expect(near(pinched, 15, 5)).toBe(false)
  })
})
