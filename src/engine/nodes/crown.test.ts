import { describe, expect, it } from 'vitest'

import { defaultDoc, elementFromDoc } from '../doc.ts'
import './index.ts'
import { evalGraph, rerollGraphSeeds } from './eval.ts'
import { nodeDef } from './registry.ts'
import { emptyGraph, type GraphNode } from './types.ts'

const BW = 48
const BH = 48

const base = {
  bw: BW,
  bh: BH,
  paletteLen: 4,
  hexValue: () => 1,
  baseStyle: elementFromDoc(defaultDoc()),
}

function crownGraph(params: Record<string, number | string | boolean>): {
  cells: Map<number, number>
} {
  const node: GraphNode = { id: 'n1', op: 'source.crown', params }
  return evalGraph({ graphVersion: 1, nodes: [node] }, base)
}

describe('source.crown', crownGeometry)

function crownGeometry() {
  it('renders a non-empty silhouette inside its box', () => {
    const { cells } = crownGraph({ x: 8, y: 8, w: 24, h: 20, color: '#f4a261' })
    expect(cells.size).toBeGreaterThan(40)
    for (const [i] of cells) {
      const x = i % BW
      const y = Math.floor(i / BW)
      expect(x).toBeGreaterThanOrEqual(7)
      expect(x).toBeLessThanOrEqual(33)
      expect(y).toBeGreaterThanOrEqual(7)
      expect(y).toBeLessThanOrEqual(29)
    }
  })

  it('is deterministic for the same seed', () => {
    const a = crownGraph({ x: 8, y: 8, w: 24, h: 20, seed: 42, jaggedness: 0.4, asymmetry: 0.5 })
    const b = crownGraph({ x: 8, y: 8, w: 24, h: 20, seed: 42, jaggedness: 0.4, asymmetry: 0.5 })
    expect(a.cells).toEqual(b.cells)
  })

  it('varies with the seed', () => {
    const a = crownGraph({ x: 8, y: 8, w: 24, h: 20, seed: 1, asymmetry: 0.6, jaggedness: 0.5 })
    const b = crownGraph({ x: 8, y: 8, w: 24, h: 20, seed: 2, asymmetry: 0.6, jaggedness: 0.5 })
    expect(a.cells).not.toEqual(b.cells)
  })

  it('jewels punch holes', () => {
    const plain = crownGraph({ x: 8, y: 8, w: 24, h: 20, jewels: 0, seed: 5 })
    const holed = crownGraph({ x: 8, y: 8, w: 24, h: 20, jewels: 5, jewelSize: 0.1, seed: 5 })
    expect(holed.cells.size).toBeLessThan(plain.cells.size)
    expect(holed.cells.size).toBeGreaterThan(0)
  })

  it('is near-symmetric at asymmetry 0 (cell rounding ±1)', () => {
    const { cells } = crownGraph({
      x: 10,
      y: 10,
      w: 20,
      h: 16,
      asymmetry: 0,
      jaggedness: 0,
      seed: 1,
    })
    const colYs = new Map<number, Set<number>>()
    for (const [i] of cells) {
      const x = i % BW
      const y = Math.floor(i / BW)
      if (!colYs.has(x)) colYs.set(x, new Set())
      colYs.get(x)!.add(y)
    }
    // mirror every column's ink pattern around x=20 and require a matching column
    let matched = 0
    for (const [x, ys] of colYs) {
      const mx = 40 - x
      const mirrored = colYs.get(mx)
      if (!mirrored) continue
      const same = [...ys].every(
        (y) => mirrored.has(y) || mirrored.has(y - 1) || mirrored.has(y + 1),
      )
      if (same) matched++
    }
    expect(matched).toBeGreaterThan(colYs.size * 0.8)
  })
}

describe('mod.path', pathPlacement)

function pathPlacement() {
  it('places count copies along a line', () => {
    const def = nodeDef('mod.path')
    expect(def).toBeDefined()
    const nodes: GraphNode[] = [
      { id: 'a', op: 'source.rect', params: { x: 1, y: 1, w: 3, h: 3, color: '#ff0000' } },
      {
        id: 'b',
        op: 'mod.path',
        params: {
          count: 3,
          pathType: 'line',
          spanX: 9,
          spanY: 0,
          rotateCopies: false,
          scaleStart: 1,
          scaleEnd: 1,
          jitter: 0,
          seed: 1,
        },
      },
    ]
    const { cells } = evalGraph({ graphVersion: 1, nodes, edges: [{ from: 'a', to: 'b' }] }, base)
    // a 3×3 rect copied 3 times at x offsets 0, 9, 18 (pivoted at its center)
    // copy k occupies x ∈ [k*9 - 1 .. k*9 + 1] around center 2 → centers at 1+9k
    let minX = Infinity
    let maxX = -Infinity
    for (const [i] of cells) {
      const x = i % BW
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
    }
    expect(maxX - minX).toBeGreaterThanOrEqual(9)
    expect(cells.size).toBeGreaterThan(9)
  })

  it('is deterministic with jitter', () => {
    const params = {
      count: 4,
      pathType: 'sine' as const,
      spanX: 12,
      spanY: -4,
      rotateCopies: true,
      scaleStart: 1,
      scaleEnd: 0.5,
      jitter: 30,
      seed: 9,
    }
    const g = (seedOverride?: number): Map<number, number> =>
      evalGraph(
        {
          graphVersion: 1,
          nodes: [
            { id: 'a', op: 'source.rect', params: { x: 1, y: 1, w: 2, h: 2, color: '#ff0000' } },
            {
              id: 'b',
              op: 'mod.path',
              params: seedOverride ? { ...params, seed: seedOverride } : params,
            },
          ],
          edges: [{ from: 'a', to: 'b' }],
        },
        base,
      ).cells
    expect(g()).toEqual(g())
    expect(g(1)).not.toEqual(g(2))
  })
}

describe('mod.scale', scaleNode)

function scaleNode() {
  it('doubles the bbox size around the pivot', () => {
    const nodes: GraphNode[] = [
      { id: 'a', op: 'source.rect', params: { x: 6, y: 6, w: 4, h: 4, color: '#ff0000' } },
      { id: 'b', op: 'mod.scale', params: { sx: 2, sy: 2, cx: 8, cy: 8 } },
    ]
    const { cells } = evalGraph({ graphVersion: 1, nodes, edges: [{ from: 'a', to: 'b' }] }, base)
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const [i] of cells) {
      const x = i % BW
      const y = Math.floor(i / BW)
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
    expect(maxX - minX).toBeGreaterThanOrEqual(6)
    expect(maxY - minY).toBeGreaterThanOrEqual(6)
  })
}

describe('rerollGraphSeeds', reroll)

function reroll() {
  it('bumps every seed-like numeric param and keeps the rest', () => {
    const nodes: GraphNode[] = [
      { id: 'a', op: 'source.shape', params: { bentoSeed: 1, x: 1, w: 5 } },
      { id: 'b', op: 'source.crown', params: { seed: 7 } },
    ]
    const out = rerollGraphSeeds(
      emptyGraph().graphVersion ? { graphVersion: 1, nodes } : emptyGraph(),
      Math.random,
    )
    const a2 = out.nodes[0].params
    const b2 = out.nodes[1].params
    expect(a2['bentoSeed']).not.toBe(1)
    expect(b2['seed']).not.toBe(7)
    expect(a2['x']).toBe(1)
    expect(typeof a2['bentoSeed']).toBe('number')
  })

  it('leaves graphs without seeds untouched', () => {
    const nodes: GraphNode[] = [{ id: 'a', op: 'source.rect', params: { x: 1 } }]
    const out = rerollGraphSeeds({ graphVersion: 1, nodes }, Math.random)
    expect(out.nodes[0].params['x']).toBe(1)
  })
}
