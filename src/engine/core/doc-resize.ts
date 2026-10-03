/** Buffer resize and sub-detail resampling. Pure grid arithmetic, content anchored top-left. */

import { MAX_CELLS, MAX_SIZE, MIN_SIZE, makeCells, type Doc, type SubDetail } from './doc'

/** Largest sub detail that fits a cols×rows grid under the MAX_CELLS ceiling (sub steps 3→2→1). */
export function fitSub(cols: number, rows: number, sub: SubDetail): SubDetail {
  const cells = cols * rows
  let s = sub
  while (s > 1 && cells * s * s > MAX_CELLS) s = s === 3 ? 2 : 1
  return s
}

/** Resize the grid (1..MAX_SIZE), preserving content anchored at the top-left. */
export function resizeDoc(doc: Doc, cols: number, rows: number): Doc {
  const c = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(cols)))
  const r = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(rows)))
  // a resize can push the buffer past MAX_CELLS at the current detail: step sub down first
  const sub = fitSub(c, r, doc.sub)
  const base =
    c === doc.cols && r === doc.rows && sub === doc.sub ? doc : resizeBuffer(doc, c, r, doc.sub)
  return sub === base.sub ? base : changeSub(base, sub)
}

/** 1:1 buffer copy into a c×r grid at the current sub, content anchored at the top-left. */
function resizeBuffer(doc: Doc, c: number, r: number, sub: SubDetail): Doc {
  const next = makeCells(c, r, sub)
  const nextObj = doc.cellObj ? new Uint32Array(next.length) : null
  const bw = doc.cols * doc.sub
  const bh = doc.rows * doc.sub
  const nbw = c * sub
  const nbh = r * sub
  for (let y = 0; y < Math.min(bh, nbh); y++) {
    for (let x = 0; x < Math.min(bw, nbw); x++) {
      next[y * nbw + x] = doc.cells[y * bw + x]
      if (nextObj && doc.cellObj) nextObj[y * nbw + x] = doc.cellObj[y * bw + x]
    }
  }
  // drop connectors that fall outside the new grid
  const links = doc.links.filter((l) => l.ax < c && l.bx < c && l.ay < r && l.by < r)
  return { ...doc, cols: c, rows: r, sub, cells: next, cellObj: nextObj, links }
}

/** Change sub-cell detail, resampling the buffer nearest-neighbor so content stays in place. */
export function changeSub(doc: Doc, sub: SubDetail): Doc {
  // sub-cells are a square-lattice feature: other grids index cells 1:1 and must not resample
  if (doc.gridType !== 'square') return doc
  const fitted = fitSub(doc.cols, doc.rows, sub)
  if (fitted === doc.sub) return doc
  sub = fitted
  const oldSub = doc.sub
  const oldBw = doc.cols * oldSub
  const oldBh = doc.rows * oldSub
  const next = makeCells(doc.cols, doc.rows, sub)
  const nextObj = doc.cellObj ? new Uint32Array(next.length) : null
  const nbw = doc.cols * sub
  const nbh = doc.rows * sub
  for (let y = 0; y < nbh; y++) {
    const py = Math.floor(y / sub)
    const oy = Math.min(oldBh - 1, py * oldSub + Math.floor(((y % sub) * oldSub) / sub))
    for (let x = 0; x < nbw; x++) {
      const px = Math.floor(x / sub)
      const ox = Math.min(oldBw - 1, px * oldSub + Math.floor(((x % sub) * oldSub) / sub))
      next[y * nbw + x] = doc.cells[oy * oldBw + ox]
      if (nextObj && doc.cellObj) nextObj[y * nbw + x] = doc.cellObj[oy * oldBw + ox]
    }
  }
  return { ...doc, sub, cells: next, cellObj: nextObj }
}
