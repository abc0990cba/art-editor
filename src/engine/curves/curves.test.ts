import { describe, expect, it } from 'vitest'

import {
  bendSegment,
  constrainPoint,
  cubicAt,
  deleteAnchor,
  flattenPath,
  hitPen,
  insertAnchor,
  makeAnchor,
  moveAnchor,
  clonePath,
  nearestOnSegment,
  pathCells,
  segmentCubic,
  pathFromD,
  pathInk,
  pathStrokeLine,
  pathToD,
  segmentCount,
  segmentEnd,
  setHandle,
  FLATTEN_TOL,
  flattenCubic,
  SIMPLIFY_TOL,
  simplifyPath,
  smoothAll,
  smoothAnchor,
  splitCubic,
  toggleSmooth,
  type AngleSnap,
  type CurveAnchor,
  type CurvePath,
  type PathInk,
  type PenRasterOpts,
} from './index.ts'

function linePath(...pts: [number, number][]): CurvePath {
  return { anchors: pts.map(([x, y]) => makeAnchor(x, y)), closed: false }
}

function curvedPath(): CurvePath {
  const p = linePath([0, 10], [10, 0], [20, 10])
  p.anchors[1].hOut = [15, 0]
  p.anchors[2].hIn = [15, 10]
  return p
}

describe('curve model', () => {
  it('round-trips through the d string, preserving corners vs smooth points', () => {
    const p = curvedPath()
    const back = pathFromD(pathToD(p))
    expect(back).not.toBeNull()
    expect(back?.anchors).toHaveLength(3)
    expect(back?.anchors[0].hOut).toBeNull()
    expect(back?.anchors[1].hOut).toEqual([15, 0])
    expect(back?.anchors[2].hIn).toEqual([15, 10])
  })

  it('round-trips a closed path with the Z flag', () => {
    const p = { ...linePath([5, 5], [15, 5], [10, 15]), closed: true }
    const back = pathFromD(pathToD(p))
    expect(back?.closed).toBe(true)
    expect(back?.anchors).toHaveLength(3)
  })

  it('rejects malformed or foreign d strings', () => {
    expect(pathFromD('')).toBeNull()
    expect(pathFromD('X 1 2')).toBeNull()
    expect(pathFromD('M 1')).toBeNull()
    expect(pathFromD('m 1 2 L 3 4')).toBeNull()
    expect(pathFromD('M 1 2 C 3 4')).toBeNull()
  })
})

describe('flatten', () => {
  it('evaluates the cubic endpoints exactly', () => {
    expect(cubicAt([0, 0], [5, 0], [5, 10], [10, 10], 0)).toEqual([0, 0])
    expect(cubicAt([0, 0], [5, 0], [5, 10], [10, 10], 1)).toEqual([10, 10])
  })

  it('keeps straight segments exactly on their endpoints', () => {
    const pts = flattenPath(linePath([0, 0], [0, 20], [30, 20]))
    expect(pts).toEqual([
      [0, 0],
      [0, 20],
      [30, 20],
    ])
  })

  it('a single anchor flattens to exactly that point', () => {
    expect(flattenPath(linePath([4, 7]))).toEqual([[4, 7]])
  })
})

describe('editing', () => {
  it('moves handles with their anchor', () => {
    const p = moveAnchor(curvedPath(), 1, 12, 3)
    expect(p.anchors[1]).toMatchObject({ x: 12, y: 3 })
    expect(p.anchors[1].hOut).toEqual([17, 3])
    expect(p.anchors[0].hOut).toBeNull()
  })

  it('mirrors the opposite handle when setHandle asks, leaves broken corners broken', () => {
    const p = curvedPath()
    p.anchors[1].hIn = [5, 0]
    const mirrored = setHandle(p, 1, 'out', [14, 5], true)
    expect(mirrored.anchors[1].hOut).toEqual([14, 5])
    expect(mirrored.anchors[1].hIn).toEqual([6, -5])
    const free = setHandle(p, 1, 'out', [14, 5], false)
    expect(free.anchors[1].hIn).toEqual([5, 0])
    const corner = curvedPath()
    corner.anchors[1].hIn = null
    const broken = setHandle(corner, 1, 'out', [14, 5], true)
    expect(broken.anchors[1].hIn).toBeNull()
  })

  it('bending a straight segment materializes both handles', () => {
    const start = linePath([0, 0], [10, 0])
    const bent = bendSegment(start, 0, 2, 3)
    expect(bent.anchors[0].hOut).toEqual([2, 3])
    expect(bent.anchors[1].hIn).toEqual([12, 3])
  })

  it('insertAnchor splits a curved segment and inherits the halves', () => {
    const p = insertAnchor(curvedPath(), 1, 0.5)
    expect(p.anchors).toHaveLength(4)
    const mid = p.anchors[2]
    expect(mid.x).toBeCloseTo(15)
    expect(mid.y).toBeCloseTo(5)
    expect(mid.hIn).not.toBeNull()
    expect(mid.hOut).not.toBeNull()
    expect(p.anchors[1].hOut).not.toBeNull()
    expect(p.anchors[3].hIn).not.toBeNull()
    expect(p.anchors[3].hOut).toBeNull()
  })

  it('insertAnchor keeps a straight segment straight', () => {
    const p = insertAnchor(linePath([0, 0], [10, 0]), 0, 0.5)
    expect(p.anchors).toHaveLength(3)
    expect(p.anchors[1]).toMatchObject({ x: 5, y: 0, hIn: null, hOut: null })
    expect(p.anchors[0].hOut).toBeNull()
    expect(p.anchors[2].hIn).toBeNull()
  })

  it('deleteAnchor opens a path that drops below two anchors', () => {
    const p = { ...linePath([0, 0], [5, 5], [10, 0]), closed: true }
    expect(deleteAnchor(p, 2).anchors).toHaveLength(2)
    const two = { ...linePath([0, 0], [5, 5]), closed: true }
    expect(deleteAnchor(two, 1)).toMatchObject({ closed: false })
  })

  it('toggles corner anchors to smooth and back', () => {
    const p = linePath([0, 0], [10, 10], [20, 0])
    const smooth = toggleSmooth(p, 1)
    expect(smooth.anchors[1].hIn).not.toBeNull()
    expect(smooth.anchors[1].hOut).not.toBeNull()
    const corner = toggleSmooth(smooth, 1)
    expect(corner.anchors[1].hIn).toBeNull()
    expect(corner.anchors[1].hOut).toBeNull()
  })

  it('smoothAll gives every anchor of a closed path both handles', () => {
    const p = { ...linePath([0, 0], [10, 0], [10, 10], [0, 10]), closed: true }
    const s = smoothAll(p)
    for (const a of s.anchors) {
      expect(a.hIn).not.toBeNull()
      expect(a.hOut).not.toBeNull()
    }
  })

  it('hitPen prefers the anchor over the underlying segment and misses outside tolerance', () => {
    const p = linePath([0, 0], [40, 0])
    expect(hitPen(p, 0, 0.3, 1)).toMatchObject({ kind: 'anchor', i: 0 })
    expect(hitPen(p, 20, 0.3, 1)).toMatchObject({ kind: 'segment', seg: 0 })
    expect(hitPen(p, 20, 5, 1)).toBeNull()
  })

  it('constrainPoint snaps to 45° steps and ortho axes', () => {
    const snapped = constrainPoint([0, 0], 9, 2, 'free', true)
    expect(snapped[1]).toBeCloseTo(0)
    expect(Math.hypot(snapped[0], snapped[1])).toBeCloseTo(Math.hypot(9, 2))
    expect(constrainPoint([0, 0], 9, 2, 'ortho', false)).toEqual([9, 0])
    expect(constrainPoint([0, 0], 2, 9, 'ortho', false)).toEqual([0, 9])
    expect(constrainPoint([0, 0], 9, 2, 'free', false)).toEqual([9, 2])
  })
})

describe('simplify', () => {
  it('drops collinear corner runs down to the endpoints', () => {
    const p = linePath([0, 0], [4, 0], [8, 0], [12, 0], [12, 4], [12, 8])
    const s = simplifyPath(p, 0.5)
    expect(s.anchors).toHaveLength(3)
    expect(s.anchors[0]).toMatchObject({ x: 0, y: 0 })
    expect(s.anchors[1]).toMatchObject({ x: 12, y: 0 })
    expect(s.anchors[2]).toMatchObject({ x: 12, y: 8 })
  })

  it('keeps a genuinely curved path intact', () => {
    const p = curvedPath()
    expect(simplifyPath(p, 0.5).anchors).toHaveLength(3)
  })

  it('never shrinks below the protected minimum', () => {
    expect(simplifyPath(linePath([0, 0], [1, 1])).anchors).toHaveLength(2)
    const closed = { ...linePath([0, 0], [10, 0], [10, 10]), closed: true }
    expect(simplifyPath(closed).anchors.length).toBeGreaterThanOrEqual(3)
  })
})

describe('raster', () => {
  it('width 1 stroke of a straight path is the bare Bresenham line', () => {
    const cells = pathCells(linePath([0, 0], [5, 0]), 16, 16)
    expect(cells.size).toBe(6)
    for (let x = 0; x <= 5; x++) expect(cells.has(x)).toBe(true)
  })

  it('width 3 strokes exactly the pencil circle tip along the line', () => {
    const cells = pathCells(linePath([2, 8], [6, 8]), 16, 16, { width: 3 })
    // circleBrush(3) = the 5-cell plus stamp: rows y=7,9 reach x=2..6, row y=8 reaches x=1..7
    expect(cells.size).toBe(5 + 7 + 5)
    expect(cells.has(8 * 16 + 7)).toBe(true)
    expect(cells.has(8 * 16 + 1)).toBe(true)
    expect(cells.has(7 * 16 + 4)).toBe(true)
  })

  it('clips to the buffer', () => {
    const cells = pathCells(linePath([-5, 0], [5, 0]), 4, 4)
    for (const i of cells) {
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThan(16)
    }
  })

  it('fills the interior of closed paths and not open ones', () => {
    const square = { ...linePath([2, 2], [8, 2], [8, 8], [2, 8]), closed: true }
    const filled = pathCells(square, 16, 16, { fill: true })
    expect(filled.size).toBeGreaterThan(pathCells(square, 16, 16).size)
    expect(filled.has(5 * 16 + 5)).toBe(true)
    const open = linePath([2, 2], [8, 2], [8, 8], [2, 8])
    expect(pathCells(open, 16, 16, { fill: true })).toEqual(pathCells(open, 16, 16))
  })

  it('width 1 is exactly the center line', () => {
    const p = curvedPath()
    expect(pathCells(p, 32, 32)).toEqual(new Set(pathStrokeLine(p).map(([x, y]) => y * 32 + x)))
  })

  it('rasterizes identically after the d-string round-trip (parametric parity)', () => {
    for (const p of [curvedPath(), { ...curvedPath(), closed: true }]) {
      const back = pathFromD(pathToD(p))
      expect(back).not.toBeNull()
      expect(pathCells(back!, 32, 32, { width: 3, fill: true })).toEqual(
        pathCells(p, 32, 32, { width: 3, fill: true }),
      )
    }
  })
})

describe('flatten surface', () => {
  it('splitCubic halves join back into the original curve', () => {
    const p0: [number, number] = [0, 0]
    const c1: [number, number] = [4, 10]
    const c2: [number, number] = [12, 2]
    const p3: [number, number] = [16, 8]
    const { left, right } = splitCubic(p0, c1, c2, p3, 0.4)
    expect(left[0]).toEqual(p0)
    expect(right[3]).toEqual(p3)
    expect(left[3]).toEqual(right[0])
  })

  it('nearestOnSegment projects onto the curve with sub-cell accuracy', () => {
    const path: CurvePath = {
      anchors: [
        { x: 0, y: 0, hIn: null, hOut: [10, 0] },
        { x: 20, y: 0, hIn: [10, 0], hOut: null },
      ],
      closed: false,
    }
    const n = nearestOnSegment(path, 0, 10, 4)
    expect(n.dist).toBeCloseTo(4, 1)
    expect(n.x).toBeGreaterThan(7)
    expect(n.x).toBeLessThan(13)
  })

  it('smoothAnchor gives one anchor handles; smoothAll covers every anchor', () => {
    const a: CurveAnchor = { x: 5, y: 5, hIn: null, hOut: null }
    const path: CurvePath = { anchors: [a, { x: 15, y: 5, hIn: null, hOut: null }], closed: false }
    const one = smoothAnchor(path, 0)
    expect(one.anchors[0].hOut).not.toBeNull()
    expect(one.anchors[1].hIn).toBeNull()
    const all = smoothAll(path)
    expect(all.anchors[1].hIn).not.toBeNull()
  })

  it('the default tolerances stay sub-cell', () => {
    expect(SIMPLIFY_TOL).toBeLessThan(1)
    expect(FLATTEN_TOL).toBeLessThan(1)
    const opts: PenRasterOpts = { width: 3, fill: true }
    expect(opts.width).toBe(3)
    const snap: AngleSnap = 'deg45'
    expect(constrainPoint([0, 0], 5, 5, snap, false)[0]).toBeCloseTo(5)
  })

  it('segmentCubic exposes the collapsed controls of straight segments', () => {
    const p = linePath([0, 0], [10, 0])
    const [p0, c1, c2, p3] = segmentCubic(p, 0)
    expect(p0).toEqual([0, 0])
    expect(c1).toEqual([0, 0])
    expect(c2).toEqual([10, 0])
    expect(p3).toEqual([10, 0])
    // clonePath shares nothing: mutating the clone leaves the original untouched
    const clone = clonePath(p)
    clone.anchors[0].x = 99
    expect(p.anchors[0].x).toBe(0)
  })

  it('segmentCount and segmentEnd count the wrap-around on closed paths', () => {
    const open = linePath([0, 0], [5, 0], [5, 5])
    expect(segmentCount(open)).toBe(2)
    expect(segmentEnd(open, 1)).toBe(2)
    const closed = { ...open, closed: true }
    expect(segmentCount(closed)).toBe(3)
    expect(segmentEnd(closed, 2)).toBe(0)
  })

  it('flattenCubic samples one cubic end to end without the caller building a path', () => {
    const pts = flattenCubic([0, 0], [0, 10], [10, 10], [10, 0])
    expect(pts[0]).not.toEqual([0, 0])
    expect(pts[pts.length - 1]).toEqual([10, 0])
  })

  it('pathInk splits stroke and interior for two-color painting', () => {
    const square: CurvePath = { ...linePath([2, 2], [8, 2], [8, 8], [2, 8]), closed: true }
    const ink: PathInk = pathInk(square, 16, 16, { width: 2, fill: true })
    expect(ink.fill.has(5 * 16 + 5)).toBe(true)
    expect(ink.stroke.has(5 * 16 + 5)).toBe(false)
    expect(ink.stroke.has(2 * 16 + 2)).toBe(true)
  })
})
