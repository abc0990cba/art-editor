import { byAngle } from './grid-polar.ts'
import { buildLattice } from './grids-lattices.ts'
import type { Grid, GridType } from './grids.ts'
import type { Pt } from './marching-squares.ts'

const HEX_R = 1 // hexagon circumradius (pointy-top)
const HEX_W = Math.sqrt(3) * HEX_R // column step
const TRI_S = 1 // triangle side
const TRI_H = (Math.sqrt(3) / 2) * TRI_S // band height

const q6 = (v: number) => Math.round(v * 1e6) / 1e6
const edgeKey = (a: Pt, b: Pt) => {
  const p = `${q6(a.x)},${q6(a.y)}`
  const q = `${q6(b.x)},${q6(b.y)}`
  return p < q ? `${p}|${q}` : `${q}|${p}`
}

export function buildGrid(type: GridType, cols: number, rows: number, even: boolean): Grid {
  const lattice = buildLattice(type, cols, rows)
  if (lattice) return attachEdgeMap(lattice)
  if (type === 'square') return makeSquare(cols, rows)
  if (type === 'hex') return attachEdgeMap(makeHex(cols, rows))
  if (type === 'triangle') return attachEdgeMap(makeTriangle(cols, rows))
  return attachEdgeMap(makeRadial(cols, rows, even))
}

function attachEdgeMap(grid: Grid): Grid {
  const polygons = Array.from({ length: grid.count }, (_, i) => grid.polygon(i))
  const owner = new Map<string, number>()
  const adj = new Map<number, number[]>()
  for (let i = 0; i < polygons.length; i++) {
    const poly = polygons[i]
    for (let k = 0; k < poly.length; k++) {
      // degenerate edges (the innermost radial ring collapses to the center point)
      // are not real boundaries and would collide on one key for many cell pairs
      const a = poly[k]
      const b = poly[(k + 1) % poly.length]
      if (a.x === b.x && a.y === b.y) continue
      const key = edgeKey(a, b)
      const prev = owner.get(key)
      if (prev === undefined) {
        owner.set(key, i)
      } else if (prev !== i) {
        if (!adj.has(prev)) adj.set(prev, [])
        if (!adj.has(i)) adj.set(i, [])
        // two cells may share several arc sub-edges (T-junction rings): keep the pair once
        if (!adj.get(prev)!.includes(i)) {
          adj.get(prev)!.push(i)
          adj.get(i)!.push(prev)
        }
        owner.delete(key)
      }
    }
  }
  return { ...grid, edgeNeighbors: (i: number) => adj.get(i) ?? [] }
}

/* ---------------------------------- square ---------------------------------- */

function makeSquare(cols: number, rows: number): Grid {
  const count = cols * rows
  const center = (i: number) => ({ x: (i % cols) + 0.5, y: Math.floor(i / cols) + 0.5 })
  const polygon = (i: number) => {
    const { x, y } = center(i)
    return [
      { x: x - 0.5, y: y - 0.5 },
      { x: x + 0.5, y: y - 0.5 },
      { x: x + 0.5, y: y + 0.5 },
      { x: x - 0.5, y: y + 0.5 },
    ]
  }
  const radiusOf = (i: number) => Math.hypot(center(i).x - cols / 2, center(i).y - rows / 2)
  const angleOf = (i: number) => Math.atan2(center(i).y - rows / 2, center(i).x - cols / 2)
  return {
    type: 'square',
    cols,
    rows,
    w: cols,
    h: rows,
    count,
    center,
    polygon,
    cellAt: (x, y) => {
      if (x < 0 || y < 0 || x >= cols || y >= rows) return -1
      return Math.floor(y) * cols + Math.floor(x)
    },
    edgeNeighbors: (i) => {
      const x = i % cols
      const y = Math.floor(i / cols)
      const out: number[] = []
      if (x > 0) out.push(i - 1)
      if (x < cols - 1) out.push(i + 1)
      if (y > 0) out.push(i - cols)
      if (y < rows - 1) out.push(i + cols)
      return out
    },
    radiusOf,
    angleOf,
    cellByAngle: (i, target) => byAngle(count, radiusOf, angleOf, i, target),
  }
}

/* ----------------------------------- hex ------------------------------------ */

function makeHex(cols: number, rows: number): Grid {
  const count = cols * rows
  const w = HEX_W * (cols + 0.5)
  const h = 1.5 * (rows - 1) + 2 * HEX_R
  const rowOf = (i: number) => Math.floor(i / cols)
  const colOf = (i: number) => i % cols
  const center = (i: number) => {
    const row = rowOf(i)
    const col = colOf(i)
    return { x: HEX_W * (col + 0.5 * (row % 2)) + HEX_W / 2, y: 1.5 * row + HEX_R }
  }
  const polygon = (i: number) => {
    const { x, y } = center(i)
    const pts: Pt[] = []
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 180) * (60 * k - 30)
      pts.push({ x: x + HEX_R * Math.cos(a), y: y + HEX_R * Math.sin(a) })
    }
    return pts
  }
  const radiusOf = (i: number) => Math.hypot(center(i).x - w / 2, center(i).y - h / 2)
  const angleOf = (i: number) => Math.atan2(center(i).y - h / 2, center(i).x - w / 2)
  return {
    type: 'hex',
    cols,
    rows,
    w,
    h,
    count,
    center,
    polygon,
    cellAt: (x, y) => {
      // remove canvas margins, then pointy-top pixel→axial with cube rounding
      const xc = x - HEX_W / 2
      const yr = y - HEX_R
      const qf = ((Math.sqrt(3) / 3) * xc - (1 / 3) * yr) / HEX_R
      const rf = ((2 / 3) * yr) / HEX_R
      let rx = Math.round(qf)
      let ry = Math.round(rf)
      const rz = Math.round(-qf - rf)
      const dq = Math.abs(rx - qf)
      const dy = Math.abs(ry - rf)
      const dz = Math.abs(rz - -qf - rf)
      if (dq > dy && dq > dz) rx = -ry - rz
      else if (dy > dz) ry = -rx - rz
      const row = ry
      const col = rx + Math.floor((row - (row & 1)) / 2)
      if (row < 0 || row >= rows || col < 0 || col >= cols) return -1
      return row * cols + col
    },
    edgeNeighbors: () => [],
    radiusOf,
    angleOf,
    cellByAngle: (i, target) => byAngle(count, radiusOf, angleOf, i, target),
  }
}

/* --------------------------------- triangle --------------------------------- */

function makeTriangle(cols: number, rows: number): Grid {
  const count = cols * rows
  const w = (Math.floor((cols - 1) / 2) + 2) * TRI_S // last down base sticks out 0.5
  const h = rows * TRI_H
  const rowOf = (i: number) => Math.floor(i / cols)
  const colOf = (i: number) => i % cols
  const isUp = (i: number) => (colOf(i) + rowOf(i)) % 2 === 0
  const kOf = (i: number) => Math.floor(colOf(i) / 2)
  const center = (i: number) => {
    const y0 = rowOf(i) * TRI_H
    const k = kOf(i)
    if (isUp(i)) return { x: k + 0.5, y: y0 + (2 / 3) * TRI_H }
    return { x: k + 1, y: y0 + (1 / 3) * TRI_H }
  }
  const polygon = (i: number) => {
    const row = rowOf(i)
    const col = colOf(i)
    const k = kOf(i)
    const y0 = row * TRI_H
    const y1 = y0 + TRI_H
    if ((col + row) % 2 === 0) {
      // apex top at (k+0.5, y0); base [k, k+1] at y1 split at the midpoint
      return [
        { x: k + 0.5, y: y0 },
        { x: k + 1, y: y1 },
        { x: k + 0.5, y: y1 },
        { x: k, y: y1 },
      ]
    }
    // apex bottom at (k+1, y1); base [k+0.5, k+1.5] at y0 split at the midpoint
    return [
      { x: k + 0.5, y: y0 },
      { x: k + 1, y: y0 },
      { x: k + 1.5, y: y0 },
      { x: k + 1, y: y1 },
    ]
  }
  const radiusOf = (i: number) => Math.hypot(center(i).x - w / 2, center(i).y - h / 2)
  const angleOf = (i: number) => Math.atan2(center(i).y - h / 2, center(i).x - w / 2)
  return {
    type: 'triangle',
    cols,
    rows,
    w,
    h,
    count,
    center,
    polygon,
    cellAt: (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return -1
      const row = Math.min(rows - 1, Math.max(0, Math.floor(y / TRI_H)))
      // the band holds at most `cols` triangles: test them all by point-in-polygon
      for (let c = 0; c < cols; c++) {
        if (pointInPolygon({ x, y }, polygon(row * cols + c))) return row * cols + c
      }
      return -1
    },
    edgeNeighbors: () => [],
    radiusOf,
    angleOf,
    cellByAngle: (i, target) => byAngle(count, radiusOf, angleOf, i, target),
  }
}

/* ---------------------------------- radial ---------------------------------- */

function makeRadial(cols: number, rows: number, even: boolean): Grid {
  // sector count per ring: uniform (classic) or graded so cell arc length stays
  // close to the ring thickness. The graded count is quantized into halving bands
  // (cols → cols/2 → …): every radial edge of an inner ring continues an outer
  // ring edge, so rings stay visually aligned instead of zigzagging.
  const ringSectors: number[] = Array.from({ length: rows })
  {
    let s = cols
    for (let ring = rows - 1; ring >= 0; ring--) {
      if (even) {
        while (s > 2 && (2 * Math.PI * (ring + 0.5)) / s < 1) s = Math.max(2, Math.floor(s / 2))
      }
      ringSectors[ring] = s
    }
  }
  const ringStart: number[] = []
  let acc = 0
  for (let ring = 0; ring < rows; ring++) {
    ringStart.push(acc)
    acc += ringSectors[ring]
  }
  const count = acc
  const ringOfArr = new Int32Array(count)
  for (let ring = 0; ring < rows; ring++) {
    for (let i = ringStart[ring]; i < ringStart[ring] + ringSectors[ring]; i++) ringOfArr[i] = ring
  }
  const w = 2 * rows + 2
  const h = 2 * rows + 2
  const cx = w / 2
  const cy = h / 2
  const rMax = rows
  const ARC = 4 // samples per arc edge (keeps neighbor edge keys exact)
  const center = (i: number) => {
    const ring = ringOfArr[i]
    const sector = i - ringStart[ring]
    const s = ringSectors[ring]
    const rm = (rMax / rows) * (ring + 0.5)
    const am = (2 * Math.PI * (sector + 0.5)) / s
    return { x: cx + rm * Math.cos(am), y: cy + rm * Math.sin(am) }
  }
  // angular span [a0, a1] split at the sector boundaries of `otherRing`: two vertically
  // adjacent rings have different sector counts (even mode), so their shared arc must
  // carry identical sample points on both sides or edge-key adjacency breaks
  const arcPoints = (r: number, otherRing: number, a0: number, a1: number): Pt[] => {
    const at = (a: number) => ({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
    const stops: number[] = [a0]
    if (otherRing >= 0 && otherRing < rows) {
      const step = (2 * Math.PI) / ringSectors[otherRing]
      const kLo = Math.max(0, Math.floor(a0 / step + 1e-9))
      const kHi = Math.min(ringSectors[otherRing], Math.ceil(a1 / step - 1e-9))
      for (let k = kLo; k <= kHi; k++) {
        const a = k * step
        if (a > a0 + 1e-9 && a < a1 - 1e-9) stops.push(a)
      }
    }
    stops.push(a1)
    const pts: Pt[] = [at(stops[0])]
    for (let k = 0; k < stops.length - 1; k++) {
      for (let j = 1; j <= ARC; j++) {
        pts.push(at(stops[k] + ((stops[k + 1] - stops[k]) * j) / (ARC + 1)))
      }
      pts.push(at(stops[k + 1]))
    }
    return pts
  }
  const polygon = (i: number) => {
    const ring = ringOfArr[i]
    const sector = i - ringStart[ring]
    const s = ringSectors[ring]
    const r0 = (rMax / rows) * ring
    const r1 = (rMax / rows) * (ring + 1)
    const a0 = (2 * Math.PI * sector) / s
    const a1 = (2 * Math.PI * (sector + 1)) / s
    const at = (r: number, a: number) => ({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
    const outer = arcPoints(r1, ring + 1, a0, a1)
    const inner = arcPoints(r0, ring - 1, a0, a1)
    const pts: Pt[] = [at(r0, a0), at(r1, a0), ...outer.slice(1), at(r0, a1)]
    // inner arc runs back from a1 to a0 without duplicating its endpoints
    for (let k = inner.length - 2; k >= 1; k--) pts.push(inner[k])
    return pts
  }
  const radiusOf = (i: number) => Math.hypot(center(i).x - cx, center(i).y - cy)
  const angleOf = (i: number) => Math.atan2(center(i).y - cy, center(i).x - cx)
  return {
    type: 'radial',
    cols,
    rows,
    w,
    h,
    count,
    center,
    polygon,
    cellAt: (x, y) => {
      const r = Math.hypot(x - cx, y - cy)
      if (r > rMax) return -1
      const ring = Math.min(rows - 1, Math.max(0, Math.floor((r / rMax) * rows)))
      let a = Math.atan2(y - cy, x - cx)
      if (a < 0) a += 2 * Math.PI
      const s = ringSectors[ring]
      const sector = Math.min(s - 1, Math.floor((a / (2 * Math.PI)) * s))
      return ringStart[ring] + sector
    },
    edgeNeighbors: () => [],
    radiusOf,
    angleOf,
    cellByAngle: (i, target) => byAngle(count, radiusOf, angleOf, i, target),
    ringSectorOf: (i) => {
      const ring = ringOfArr[i]
      return [ring, i - ringStart[ring], ringSectors[ring]]
    },
  }
}

/** Even-odd point-in-polygon test (used by triangle and radial cell hit-testing). */
function pointInPolygon(pt: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}
