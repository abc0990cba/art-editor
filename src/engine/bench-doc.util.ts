import { defaultDoc, elementFromDoc, makeCells, type Doc } from './core/doc.ts'
import { newLayer, newObj, syncDoc } from './core/scene.ts'
import { PENDING_OBJ, type Staging } from './geometry/index.ts'

/**
 * Deterministic fixtures for performance benchmarks (engine benches + the ?bench=1 browser
 * harness). Everything is seeded and size-agnostic: docs are built as plain literals, deliberately
 * bypassing MAX_SIZE, so benches can probe hypothetical 2048²/4096² canvases on today's engine.
 */

/** Deterministic PRNG (mulberry32) so every bench run paints bit-identical ink. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Size-agnostic square doc base: pixels mode, plain 1×1 squares, sub 1. */
function sizedDoc(cols: number, rows: number): Doc {
  const doc = defaultDoc()
  doc.cols = cols
  doc.rows = rows
  doc.sub = 1
  doc.cells = makeCells(cols, rows, 1)
  doc.cellObj = null
  doc.elements = []
  doc.layers = null
  return doc
}

/**
 * Flat doc with scattered deterministic ink (two palette values). Scatter is the pessimistic case
 * for geometry: every cell is an isolated path fragment with no horizontal runs to merge.
 */
export function flatBenchDoc(cols: number, rows: number, inkFrac: number): Doc {
  const doc = sizedDoc(cols, rows)
  const rng = mulberry32(cols * 7919 + rows)
  const total = doc.cells.length
  const target = Math.round(total * inkFrac)
  let placed = 0
  while (placed < target) {
    const i = Math.floor(rng() * total)
    if (doc.cells[i] === 0) {
      doc.cells[i] = Math.floor(rng() * 2) + 1
      placed++
    }
  }
  return doc
}

/**
 * Flat doc with horizontal band ink: long same-value runs (length 64) — the run-friendly pattern
 * classic pixel art produces, the best case for run-merging geometry (contrast: `flatBenchDoc`
 * scatter is the worst case).
 */
export function flatRunsBenchDoc(cols: number, rows: number, rowFrac: number): Doc {
  const doc = sizedDoc(cols, rows)
  const bw = cols
  const bandRows = Math.round(rows * rowFrac)
  for (let by = 0; by < bandRows; by++) {
    const row = by * bw
    for (let bx = 0; bx < bw; bx++) doc.cells[row + bx] = ((bx >> 6) & 1) + 1
  }
  return doc
}

/** Scene doc: one layer, `objCount` objects of `cellsPerObj` cells each (random-walk clusters). */
export function sceneBenchDoc(
  cols: number,
  rows: number,
  objCount: number,
  cellsPerObj: number,
): Doc {
  let doc = sizedDoc(cols, rows)
  const rng = mulberry32(cols * 31 + rows * 17 + objCount)
  const bw = cols
  const bh = rows
  const style = elementFromDoc(doc)
  const { layer, doc: withLayer } = newLayer(doc, 'bench')
  doc = withLayer
  for (let k = 0; k < objCount; k++) {
    const { obj, doc: next } = newObj(doc, style, `obj${k}`)
    doc = next
    let x = Math.floor(rng() * bw)
    let y = Math.floor(rng() * bh)
    for (let c = 0; c < cellsPerObj; c++) {
      obj.cells.set(y * bw + x, (k % 12) + 1)
      const dir = Math.floor(rng() * 4)
      if (dir === 0) x = Math.min(bw - 1, x + 1)
      else if (dir === 1) x = Math.max(0, x - 1)
      else if (dir === 2) y = Math.min(bh - 1, y + 1)
      else y = Math.max(0, y - 1)
    }
    layer.children.push(obj)
  }
  return syncDoc({ ...doc, layers: [layer] })
}

/** A stroke in flight: `count` staged cells along a deterministic random walk. */
export function strokeStaging(bw: number, count: number, seed = 42): Staging {
  const rng = mulberry32(seed)
  const cells = new Map<number, number | null>()
  const objs = new Map<number, number | null>()
  let x = Math.floor(bw / 2)
  let y = x
  for (let c = 0; c < count; c++) {
    const i = y * bw + x
    cells.set(i, (c % 3) + 1)
    objs.set(i, PENDING_OBJ)
    const dir = Math.floor(rng() * 4)
    if (dir === 0) x = Math.min(bw - 1, x + 1)
    else if (dir === 1) x = Math.max(0, x - 1)
    else if (dir === 2) y = Math.min(bw - 1, y + 1)
    else y = Math.max(0, y - 1)
  }
  return { cells, objs }
}

/** A horizontal stroke of `count` distinct cells starting at buffer index `from` (commit fixture). */
export function strokeCells(count: number, from: number): Map<number, number> {
  const cells = new Map<number, number>()
  for (let c = 0; c < count; c++) cells.set(from + c, (c % 3) + 1)
  return cells
}

/** Flat doc holding one filled disc — a contiguous region for flood-fill benches. */
export function floodBenchDoc(
  cols: number,
  rows: number,
  radiusFrac: number,
): { doc: Doc; start: number } {
  const doc = sizedDoc(cols, rows)
  const bw = cols
  const bh = rows
  const cx = bw >> 1
  const cy = bh >> 1
  const r = Math.max(1, Math.floor(Math.min(bw, bh) * radiusFrac))
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= bw || y >= bh) continue
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy <= r * r) doc.cells[y * bw + x] = 1
    }
  }
  return { doc, start: cy * bw + cx }
}
