import type { Doc } from '../../engine/core/doc.ts'
import type { Grid } from '../../engine/grids/index.ts'
import type { State } from '../../state/editor.store.ts'

export interface FillSeedsCtx {
  fillScope: State['fillScope']
  doc: Doc
  grid: Grid
  bw: number
  bh: number
  isSquare: boolean
}

/**
 * Fill scope beyond the single cell: square grids fill the whole doc-cell row/column (every
 * sub-cell), radial grids the sector wedge (every ring) or the whole ring. Returns null when the
 * plain cell scope applies.
 */
export function fillSeedsFor(idx: number, s: FillSeedsCtx): number[] | null {
  if (s.fillScope === 'cell') return null
  if (s.fillScope === 'row' || s.fillScope === 'column') {
    if (!s.isSquare) return null
    const seeds: number[] = []
    if (s.fillScope === 'row') {
      const row = Math.floor(idx / s.bw / s.doc.sub)
      for (let y = row * s.doc.sub; y < (row + 1) * s.doc.sub; y++) {
        for (let x = 0; x < s.bw; x++) seeds.push(y * s.bw + x)
      }
    } else {
      const col = Math.floor((idx % s.bw) / s.doc.sub)
      for (let x = col * s.doc.sub; x < (col + 1) * s.doc.sub; x++) {
        for (let y = 0; y < s.bh; y++) seeds.push(y * s.bw + x)
      }
    }
    return seeds
  }
  if (s.doc.gridType !== 'radial') return null
  const seeds: number[] = []
  if (s.fillScope === 'ring') {
    const r0 = s.grid.radiusOf(idx)
    for (let j = 0; j < s.grid.count; j++) {
      if (Math.abs(s.grid.radiusOf(j) - r0) < 0.5) seeds.push(j)
    }
    return seeds
  }
  // sector wedge: the clicked cell's angular span, evaluated in every ring
  const norm = (a: number) => {
    a = (a + Math.PI) % (2 * Math.PI)
    if (a < 0) a += 2 * Math.PI
    return a - Math.PI
  }
  const am = s.grid.angleOf(idx)
  let dMin = Infinity
  let dMax = -Infinity
  for (const p of s.grid.polygon(idx)) {
    const d = norm(Math.atan2(p.y - s.grid.h / 2, p.x - s.grid.w / 2) - am)
    dMin = Math.min(dMin, d)
    dMax = Math.max(dMax, d)
  }
  for (let j = 0; j < s.grid.count; j++) {
    const d = norm(s.grid.angleOf(j) - am)
    if (d >= dMin - 1e-6 && d <= dMax + 1e-6) seeds.push(j)
  }
  return seeds
}
