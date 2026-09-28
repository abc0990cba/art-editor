import { useCallback, useRef } from 'react'

import { type Doc } from '../../engine/doc.ts'
import { marchingSquares, type Pt } from '../../engine/marching-squares.ts'

export interface ElementOutline {
  path: Path2D
  /** Bounding box in doc units, for the selection size badge */
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Region contour (doc units) around every cell owned by the given element ids. */
function elementOutline(doc: Doc, ids: number[], bw: number, bh: number): ElementOutline | null {
  if (!doc.cellObj || ids.length === 0) return null
  const set = new Set(ids)
  const w = bw + 2
  const h = bh + 2
  const field = new Float32Array(w * h)
  let any = false
  let minX = bw
  let minY = bh
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const i = y * bw + x
      if (doc.cells[i] > 0 && set.has(doc.cellObj[i])) {
        field[(y + 1) * w + (x + 1)] = 1
        any = true
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  if (!any) return null
  const loops: Pt[][] = marchingSquares(field, w, h, 0.5)
  const path = new Path2D()
  for (const loop of loops) {
    loop.forEach((p, k) => {
      const x = (p.x - 0.5) / doc.sub
      const y = (p.y - 0.5) / doc.sub
      if (k === 0) path.moveTo(x, y)
      else path.lineTo(x, y)
    })
    path.closePath()
  }
  return {
    path,
    minX: minX / doc.sub,
    minY: minY / doc.sub,
    maxX: (maxX + 1) / doc.sub,
    maxY: (maxY + 1) / doc.sub,
  }
}

/**
 * Outline builder with a per-doc cache: building a contour allocates a full-buffer float field and
 * runs marching squares over it — far too slow to redo on every hover move in select mode. Keyed
 * per doc; the doc only changes on commit, so hits cover all hover/redraw work.
 */
export function useOutlineCache(
  doc: Doc,
  bw: number,
  bh: number,
): (ids: number[]) => ElementOutline | null {
  const cacheRef = useRef<{ doc: Doc; map: Map<string, ElementOutline | null> } | null>(null)
  return useCallback(
    (ids: number[]) => {
      const key = [...ids].sort((a, b) => a - b).join(',')
      let c = cacheRef.current
      if (!c || c.doc !== doc) c = cacheRef.current = { doc, map: new Map() }
      const hit = c.map.get(key)
      if (hit !== undefined) return hit
      const built = elementOutline(doc, ids, bw, bh)
      if (c.map.size > 128) c.map.clear()
      c.map.set(key, built)
      return built
    },
    [doc, bw, bh],
  )
}
