import type { Doc } from '../core/doc'
import { makeGrid } from '../grids'

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
  const grid = makeGrid(doc.gridType, doc.cols, doc.rows, doc.radialEven)
  return { neighbors: grid.edgeNeighbors, count: grid.count }
}

/* Pooled flood scratch: the mask clears only the touched entries after each flood, so a fill pays
 * O(region), not O(grid), for scratch reuse (a fresh 16.7M-entry mask alloc+zero per click was the
 * single largest constant of big-canvas fills). */
let maskPool: Uint8Array | null = null
let stackPool: Int32Array | null = null

/**
 * Indices of the connected region of equal values under buffer index `start`, without writing
 * anything. Square grids spread over the 4 orthogonal directions with inline neighbor math and a
 * typed stack (the old per-cell neighbor arrays allocated millions of arrays on big fills); other
 * grids use their edge adjacency.
 */
export function floodRegion(doc: Doc, start: number): number[] {
  if (doc.gridType === 'square') return floodRegionSquare(doc, start)
  const cells = doc.cells
  const { neighbors, count } = gridTopology(doc)
  if (start < 0 || start >= count) return []
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

/** Square-grid flood: inline neighbor math, typed stack, pooled mask cleared per region. */
function floodRegionSquare(doc: Doc, start: number): number[] {
  const bw = doc.cols * doc.sub
  const bh = doc.rows * doc.sub
  const count = bw * bh
  if (start < 0 || start >= count) return []
  const cells = doc.cells
  const target = cells[start]
  if (!maskPool || maskPool.length < count) maskPool = new Uint8Array(count)
  if (!stackPool || stackPool.length < count) stackPool = new Int32Array(count)
  const mask = maskPool
  const stack = stackPool
  const region: number[] = []
  let sp = 0
  mask[start] = 1
  stack[sp++] = start
  const visit = (j: number): void => {
    if (!mask[j] && cells[j] === target) {
      mask[j] = 1
      stack[sp++] = j
    }
  }
  while (sp > 0) {
    const i = stack[--sp]
    region.push(i)
    const x = i % bw
    if (x > 0) visit(i - 1)
    if (x < bw - 1) visit(i + 1)
    if (i >= bw) visit(i - bw)
    if (i + bw < count) visit(i + bw)
  }
  for (const i of region) mask[i] = 0
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
