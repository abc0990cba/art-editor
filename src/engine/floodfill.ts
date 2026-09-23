import type { Doc } from './doc'
import { makeGrid } from './grids'

/** Edge-adjacent neighbor lookup and cell count for a document's grid. */
function gridTopology(doc: Doc): { neighbors: (i: number) => number[]; count: number } {
  if (doc.gridType === 'square') {
    const bw = doc.cols * doc.sub
    const bh = doc.rows * doc.sub
    return {
      count: bw * bh,
      neighbors: (i: number): number[] => {
        const x = i % bw
        const y = Math.floor(i / bw)
        const out: number[] = []
        if (x > 0) out.push(i - 1)
        if (x < bw - 1) out.push(i + 1)
        if (y > 0) out.push(i - bw)
        if (y < bh - 1) out.push(i + bw)
        return out
      },
    }
  }
  const neighbors = makeGrid(doc.gridType, doc.cols, doc.rows, doc.radialEven).edgeNeighbors
  return { neighbors, count: doc.cols * doc.rows }
}

/**
 * Indices of the connected region of equal values under buffer index `start`, without
 * writing anything. Square grids spread over the 4 orthogonal directions; other grids
 * use their edge adjacency.
 */
export function floodRegion(doc: Doc, start: number): number[] {
  const { neighbors, count } = gridTopology(doc)
  if (start < 0 || start >= count) return []
  const cells = doc.cells
  const target = cells[start]
  const mask = new Uint8Array(count)
  mask[start] = 1
  const region: number[] = []
  const stack: number[] = [start]
  while (stack.length > 0) {
    const i = stack.pop() as number
    region.push(i)
    for (const j of neighbors(i)) {
      if (!mask[j] && cells[j] === target) {
        mask[j] = 1
        stack.push(j)
      }
    }
  }
  return region
}

/** Flood fill the connected region of equal values starting at buffer index `start`. */
export function floodFillDoc(doc: Doc, start: number, value: number): Uint16Array {
  const { count } = gridTopology(doc)
  if (start < 0 || start >= count) return doc.cells
  if (doc.cells[start] === value) return doc.cells
  const region = floodRegion(doc, start)
  const cells = doc.cells.slice()
  for (const i of region) cells[i] = value
  return cells
}
