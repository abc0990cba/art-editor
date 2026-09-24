import { describe, expect, it } from 'vitest'

import { defaultDoc, type Doc } from './doc'
import { floodFillDoc, floodRegion } from './floodfill'
import { makeGrid } from './grids'

function docWith(cells: number[], patch: Partial<Doc> = {}): Doc {
  const cols = patch.cols ?? 4
  const rows = patch.rows ?? 4
  return { ...defaultDoc(), cols, rows, cells: Uint16Array.from(cells), ...patch }
}

describe('floodFillDoc', () => {
  it('fills only the connected region of equal cells', () => {
    // vertical wall of 1s in the left column, everything else empty
    const doc = docWith(Array.from({ length: 16 }, (_, i) => (i % 4 === 0 ? 1 : 0)))
    const cells = floodFillDoc(doc, 0, 2)
    for (let i = 0; i < 16; i++) expect(cells[i]).toBe(i % 4 === 0 ? 2 : 0)
  })

  it('does not leak through diagonal-only touches (edge connectivity)', () => {
    const doc = docWith([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
    const cells = floodFillDoc(doc, 0, 2)
    expect(cells[0]).toBe(2)
    expect(cells[5]).toBe(1)
    expect(cells[10]).toBe(1)
  })

  it('returns the same buffer on no-op fills and out-of-range starts', () => {
    const doc = docWith([1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(floodFillDoc(doc, 0, 1)).toBe(doc.cells)
    expect(floodFillDoc(doc, -1, 2)).toBe(doc.cells)
    expect(floodFillDoc(doc, 16, 2)).toBe(doc.cells)
  })

  it('works in sub-cell resolution on the square grid', () => {
    const doc = docWith(Array(16).fill(0), { cols: 2, rows: 2, sub: 2 })
    const cells = floodFillDoc(doc, 0, 1)
    for (let i = 0; i < 16; i++) expect(cells[i]).toBe(1)
  })
})

describe('floodRegion', () => {
  it('collects the region without mutating the document', () => {
    const before = Uint16Array.from([1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    const doc = docWith(Array.from(before))
    const region = floodRegion(doc, 0).sort((a, b) => a - b)
    expect(region).toEqual([0, 1, 4, 5])
    expect(Array.from(doc.cells)).toEqual(Array.from(before))
  })

  it('uses grid edge adjacency on non-square grids', () => {
    const g = makeGrid('hex', 4, 3)
    // find a hex pair that shares an edge but is not a row-major buffer neighbor
    let pair: [number, number] | null = null
    for (let i = 0; i < 12 && !pair; i++) {
      for (const j of g.edgeNeighbors(i)) {
        const rowAdjacent =
          Math.floor(j / 4) === Math.floor(i / 4) ? Math.abs(j - i) === 1 : Math.abs(j - i) === 4
        if (!rowAdjacent) {
          pair = [i, j]
          break
        }
      }
    }
    expect(pair).not.toBeNull()
    const [a, b] = pair!
    const cells = Array(12).fill(0)
    cells[a] = 1
    cells[b] = 1
    // far cell is edge-adjacent to neither the seed nor its pair
    const near = new Set([a, b, ...g.edgeNeighbors(a), ...g.edgeNeighbors(b)])
    const far = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].find((i) => !near.has(i))
    expect(far).toBeDefined()
    cells[far!] = 1
    const doc = docWith(cells, { gridType: 'hex', cols: 4, rows: 3 })
    const region = floodRegion(doc, a)
    expect(region).toContain(b)
    expect(region).not.toContain(far)
  })
})
