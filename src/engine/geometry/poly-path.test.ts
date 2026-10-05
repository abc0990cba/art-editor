import { describe, expect, it } from 'vitest'

import { minCornerRun, roundedPolygonPath } from './poly-path.ts'

interface Pt {
  x: number
  y: number
}

/** Pointy-top hexagon, circumradius 1 (the hex grid's native cell polygon). */
const hexagon = (): Pt[] => {
  const pts: Pt[] = []
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 180) * (60 * k - 30)
    pts.push({ x: Math.cos(a), y: Math.sin(a) })
  }
  return pts
}

const square: Pt[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
]

/** Up triangle whose base is split at the midpoint (grid polygons carry such split vertices). */
const TRI_H = Math.sqrt(3) / 2
const splitTriangle: Pt[] = [
  { x: 0.5, y: 0 },
  { x: 1, y: TRI_H },
  { x: 0.5, y: TRI_H },
  { x: 0, y: TRI_H },
]

/** Pie slice with a densely sampled arc run: apex, arc start, samples, arc end. */
const pieSlice = (): Pt[] => {
  const pts: Pt[] = [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
  ]
  for (let a = 5; a < 60; a += 5) {
    const r = (a * Math.PI) / 180
    pts.push({ x: 2 * Math.cos(r), y: 2 * Math.sin(r) })
  }
  const end = (60 * Math.PI) / 180
  pts.push({ x: 2 * Math.cos(end), y: 2 * Math.sin(end) })
  return pts
}

/**
 * Half disc: the two radial edges are collinear at the center apex, so the loop has exactly two
 * true corners — the even-mode radial grid's ring-0 wedge is this shape.
 */
const halfDisc = (): Pt[] => {
  const pts: Pt[] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ]
  for (let a = 5; a < 180; a += 5) {
    const r = (a * Math.PI) / 180
    pts.push({ x: Math.cos(r), y: Math.sin(r) })
  }
  pts.push({ x: -1, y: 0 })
  return pts
}

type Cmd = { c: 'M' | 'L'; p: Pt } | { c: 'A'; r: number; from: Pt; to: Pt; sweep: number }

/** Minimal path parser: M/L point lists and circular A commands. */
function parse(d: string): Cmd[] {
  const out: Cmd[] = []
  const tokens = d.match(/[MLAZ][^MLAZ]*/g) ?? []
  let cur: Pt = { x: 0, y: 0 }
  for (const t of tokens) {
    const nums = t
      .slice(1)
      .split(/[\s,]+/)
      .filter((s) => s !== '')
      .map(Number)
    if (t[0] === 'A') {
      for (let i = 0; i < nums.length; i += 7) {
        const to = { x: nums[i + 5], y: nums[i + 6] }
        out.push({ c: 'A', r: nums[i], from: cur, to, sweep: nums[i + 4] })
        cur = to
      }
    } else {
      for (let i = 0; i < nums.length; i += 2) {
        cur = { x: nums[i], y: nums[i + 1] }
        out.push({ c: t[0] as 'M' | 'L', p: cur })
      }
    }
  }
  return out
}

const arcCmds = (d: string) => parse(d).filter((c): c is Extract<Cmd, { c: 'A' }> => c.c === 'A')

/** Every vertex the pen touches, in order: L/M points and arc endpoints. */
const walk = (d: string): Pt[] => parse(d).map((c) => (c.c === 'A' ? c.to : c.p))

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y)

const unit = (a: Pt, b: Pt): Pt => {
  const l = dist(a, b)
  return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }
}

/** Center of a parsed arc (disambiguated by the sweep flag). */
function arcCenter(a: Extract<Cmd, { c: 'A' }>): Pt {
  const mx = (a.from.x + a.to.x) / 2
  const my = (a.from.y + a.to.y) / 2
  const dx = a.to.x - a.from.x
  const dy = a.to.y - a.from.y
  const chord = Math.hypot(dx, dy)
  const h = Math.sqrt(Math.max(0, a.r * a.r - (chord / 2) * (chord / 2)))
  const c1 = { x: mx + (-dy / chord) * h, y: my + (dx / chord) * h }
  const c2 = { x: mx - (-dy / chord) * h, y: my - (dx / chord) * h }
  const side = (c: Pt) => (a.from.x - c.x) * (a.to.y - c.y) - (a.from.y - c.y) * (a.to.x - c.x)
  return a.sweep > 0 === side(c1) > 0 ? c1 : c2
}

/**
 * Every arc must leave its entry point along the incoming path direction and arrive along the
 * outgoing one, at distance r from a single center — the tangency the old emitter only had on 90°
 * corners. Directions read across command boundaries with wrap-around (the path is closed).
 */
function expectAllTangent(d: string, eps = 5e-3): void {
  const cmd = parse(d)
  const at = (i: number): Pt => {
    const c = cmd[(i + cmd.length) % cmd.length]
    return c.c === 'A' ? c.to : c.p
  }
  for (let i = 0; i < cmd.length; i++) {
    const a = cmd[i]
    if (a.c !== 'A') continue
    const c = arcCenter(a)
    const inDir = unit(at(i - 2), at(i - 1))
    const outDir = unit(a.to, at(i + 1))
    expect(Math.abs((c.x - a.from.x) * inDir.x + (c.y - a.from.y) * inDir.y)).toBeLessThanOrEqual(
      eps,
    )
    expect(Math.abs((c.x - a.to.x) * outDir.x + (c.y - a.to.y) * outDir.y)).toBeLessThanOrEqual(eps)
    expect(Math.abs(dist(c, a.from) - a.r)).toBeLessThanOrEqual(eps)
  }
}

describe('roundedPolygonPath tangency', () => {
  it('square corners keep radius = tangent length (90° is the exact case)', () => {
    const d = roundedPolygonPath(square, 0.25, false)
    const list = arcCmds(d)
    expect(list).toHaveLength(4)
    for (const a of list) expect(a.r).toBeCloseTo(0.25, 6)
    expectAllTangent(d)
  })

  it('hexagon fillets are tangent with radius t/tan(θ/2), not t', () => {
    const poly = hexagon()
    const d = roundedPolygonPath(poly, 0.25, false)
    const list = arcCmds(d)
    expect(list).toHaveLength(6)
    const t = 0.25
    const theta = (60 * Math.PI) / 180 // exterior turn of a hexagon corner
    const expected = t / Math.tan(theta / 2)
    const seq = walk(d)
    for (let k = 0; k < list.length; k++) {
      // was 0.25 (the bare tangent length) with the old non-tangent emitter
      expect(list[k].r).toBeCloseTo(expected, 2) // 0.433
      // walk: entry/exit tangent points interleave — arc k touches its corner's two edges
      const entry = seq[(2 * k + seq.length) % seq.length]
      const exit = seq[(2 * k + 1) % seq.length]
      const corner = poly[k]
      // tangent points sit t along both edges from the corner (path coords round to 3 decimals)
      expect(dist(entry, corner)).toBeCloseTo(t, 2)
      expect(dist(exit, corner)).toBeCloseTo(t, 2)
    }
    expectAllTangent(d)
  })

  it('collinear split vertices are passed through, and the whole base run feeds the clamp', () => {
    const d = roundedPolygonPath(splitTriangle, 0.4, false)
    const list = arcCmds(d)
    // only the 3 true corners: the base midpoint must not get a bump
    expect(list).toHaveLength(3)
    const theta = (120 * Math.PI) / 180 // exterior turn of a 60° triangle corner
    const expected = 0.4 / Math.tan(theta / 2)
    for (const a of list) expect(a.r).toBeCloseTo(expected, 2)
    expectAllTangent(d)
  })

  it('chamfer keeps the same tangent points as the arc style', () => {
    const poly = hexagon()
    const arcSeq = walk(roundedPolygonPath(poly, 0.25, false))
    const chamferSeq = walk(roundedPolygonPath(poly, 0.25, true))
    expect(chamferSeq).toHaveLength(arcSeq.length)
    chamferSeq.forEach((p, i) => {
      expect(p.x).toBeCloseTo(arcSeq[i].x, 6)
      expect(p.y).toBeCloseTo(arcSeq[i].y, 6)
    })
  })

  it('radius 0 emits the plain polygon', () => {
    const d = roundedPolygonPath(hexagon(), 0, false)
    expect(d).not.toContain('A')
    expect(d.endsWith('Z')).toBe(true)
  })

  it('deep fillets consume arc-run samples instead of being choked by the first chord', () => {
    const poly = pieSlice()
    // base = min(apex edges 2, arc run ≈ 2.09) = 2 → r = 1, t = min(1, run/2) = 1 ≫ first chord
    const d = roundedPolygonPath(poly, 1, false)
    const list = arcCmds(d)
    expect(list).toHaveLength(3) // apex + two arc-run corners; samples never fillet
    for (const a of list) {
      expect(a.r).toBeGreaterThan(0.5)
      expect(Number.isFinite(a.r)).toBe(true)
    }
  })

  it('two-corner loops (radial half-disc wedges) still round at their true corners', () => {
    // shallow fillets stay inside the first segment — full tangency applies
    const shallow = roundedPolygonPath(halfDisc(), 0.05, false)
    expect(arcCmds(shallow)).toHaveLength(2)
    expectAllTangent(shallow)
    // deep fillets reach past the first arc chord via runPoint (the documented curved-run
    // approximation) — count and magnitude only, like the pie-slice case above
    const deep = roundedPolygonPath(halfDisc(), 0.5, false)
    const list = arcCmds(deep)
    expect(list).toHaveLength(2)
    for (const a of list) expect(a.r).toBeGreaterThan(0.3)
  })
})

describe('minCornerRun', () => {
  it('measures true edges with collinear splits merged', () => {
    expect(minCornerRun(square)).toBeCloseTo(1, 6)
    expect(minCornerRun(hexagon())).toBeCloseTo(1, 6)
    expect(minCornerRun(splitTriangle)).toBeCloseTo(1, 6) // the split base counts once
  })

  it('falls back to the shortest segment for corner-free loops', () => {
    // a circle sampled every 5°: no vertex turns past the corner threshold
    const circle: Pt[] = []
    for (let a = 0; a < 360; a += 5) {
      const r = (a * Math.PI) / 180
      circle.push({ x: Math.cos(r), y: Math.sin(r) })
    }
    expect(minCornerRun(circle)).toBeCloseTo(2 * Math.sin((2.5 * Math.PI) / 180), 6)
  })

  it('measures merged collinear runs on two-corner loops', () => {
    // the diameter counts once: radial edge + collinear radial edge = 2, arc run ≈ π
    expect(minCornerRun(halfDisc())).toBeCloseTo(2, 6)
  })
})
