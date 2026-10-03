import type { Doc } from '../../engine/doc.ts'
import type { StagePaintParams, StagePaintState } from './stage-paint.util.ts'

/**
 * Plain-square fast path of the incremental stroke layer: same-row staged cells merge into rect
 * runs painted with plain fillRect calls — the exact geometry run merging produces at commit — so a
 * fast scribble costs microseconds per frame instead of a Path2D parse per staged cell. Any cell
 * the rects cannot represent (mixed colors, foreign element owners) bails the caller back to the
 * per-cell fragment path.
 */

export interface StagedRects {
  color: string
  runs: [number, number, number, number][]
  punch: [number, number, number, number][] | null
}

export interface StagedRectsCtx {
  cells: ReadonlyMap<number, number | null>
  idxs: number[]
  sess: NonNullable<StagePaintState['session']>
  doc: Doc
  bw: number
  sub: number
  colorOf: (v: number) => string
}

/** Classify staged indices into merged rect runs; null = fall back to the fragment path. */
export function splitStagedRects(s: StagedRectsCtx): StagedRects | null {
  const rows = new Map<number, number[]>()
  const punchRows = new Map<number, number[]>()
  let color: string | null = null
  for (const idx of s.idxs) {
    const v = s.cells.get(idx)
    if (v === null || v === undefined || v === 0) {
      if (s.sess.mode !== 'erase' || !eraseOwnerUsable(s.doc, idx)) return null
      const row = Math.floor(idx / s.bw)
      const cols = punchRows.get(row)
      if (cols) cols.push(idx % s.bw)
      else punchRows.set(row, [idx % s.bw])
      continue
    }
    if (s.sess.mode !== 'ink') return null
    if (color === null) color = s.colorOf(v)
    else if (color !== s.colorOf(v)) return null
    const row = Math.floor(idx / s.bw)
    const cols = rows.get(row)
    if (cols) cols.push(idx % s.bw)
    else rows.set(row, [idx % s.bw])
  }
  if (color === null && punchRows.size === 0) return null
  return {
    color: color ?? '#000',
    runs: mergeRows(rows, s.sub),
    punch: punchRows.size > 0 ? mergeRows(punchRows, s.sub) : null,
  }
}

/** Erasing reshapes a foreign element's contour — that cell must go through the legacy rebuild. */
export function eraseOwnerUsable(doc: StagePaintParams['doc'], idx: number): boolean {
  if (doc.styleScope !== 'element') return true
  const owner = doc.cellObj?.[idx] ?? 0
  const oel = owner > 0 ? doc.elements[owner - 1] : undefined
  return !oel || (oel.renderMode === 'pixels' && oel.texture.effect === 'none')
}

function mergeRows(
  colsByRow: Map<number, number[]>,
  sub: number,
): [number, number, number, number][] {
  const out: [number, number, number, number][] = []
  for (const [row, cols] of colsByRow) {
    cols.sort((a, b) => a - b)
    let start = cols[0]
    let prev = cols[0]
    for (let k = 1; k <= cols.length; k++) {
      const c = cols[k]
      if (c === prev + 1) {
        prev = c
        continue
      }
      out.push([start / sub, row / sub, (prev - start + 1) / sub, 1 / sub])
      start = c
      prev = c
    }
  }
  return out
}
