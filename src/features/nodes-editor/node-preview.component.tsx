import { useEffect, useRef } from 'react'

import type { Doc, ElementStyle } from '../../engine/doc.ts'
import { buildGeometry } from '../../engine/geometry.ts'
import type { Cells } from '../../engine/nodes/index.ts'
import { drawGeometry } from '../../engine/png.ts'

/**
 * Mini renderers for per-node previews in the node editor:
 *
 * - CellsPreview draws a cell map (the stage output of a raster node);
 * - StyleSamplePreview renders a small sample scene through the full geometry pipeline with the
 *   node's style applied (texture, metaball, render mode…). Both auto-fit their content and
 *   re-render on any change — previews can't lie.
 */

const BG = '#141419'

export function CellsPreview({
  cells,
  palette,
  bw,
  w = 166,
  h = 52,
}: {
  cells: Cells
  palette: string[]
  bw: number
  w?: number
  h?: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    const g = cv?.getContext('2d')
    if (!cv || !g) return
    const dpr = window.devicePixelRatio || 1
    cv.width = Math.round(w * dpr)
    cv.height = Math.round(h * dpr)
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.fillStyle = BG
    g.fillRect(0, 0, w, h)
    if (cells.size === 0) return
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const i of cells.keys()) {
      const x = i % bw
      const y = Math.floor(i / bw)
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
    const cols = maxX - minX + 1
    const rows = maxY - minY + 1
    const s = Math.min(w / cols, h / rows)
    const ox = (w - cols * s) / 2
    const oy = (h - rows * s) / 2
    for (const [i, v] of cells) {
      const x = i % bw
      const y = Math.floor(i / bw)
      g.fillStyle = palette[(v - 1) % palette.length] ?? '#888'
      g.fillRect(ox + (x - minX) * s, oy + (y - minY) * s, Math.ceil(s), Math.ceil(s))
    }
  }, [cells, palette, bw, w, h])
  return <canvas ref={ref} style={{ width: w, height: h }} className="border-line rounded border" />
}

export function StyleSamplePreview({
  style,
  baseDoc,
  w = 166,
  h = 52,
}: {
  style: ElementStyle
  baseDoc: Doc
  w?: number
  h?: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const key = JSON.stringify(style)
  useEffect(() => {
    const cv = ref.current
    const g = cv?.getContext('2d')
    if (!cv || !g) return
    const dpr = window.devicePixelRatio || 1
    cv.width = Math.round(w * dpr)
    cv.height = Math.round(h * dpr)
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.fillStyle = BG
    g.fillRect(0, 0, w, h)
    const cols = 12
    const rows = 6
    const cells = new Uint16Array(cols * rows)
    // two blobs: metaball/texture/render-mode samples read best on a two-blob scene
    for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) cells[y * cols + x] = 1
    for (let y = 1; y <= 3; y++) for (let x = 7; x <= 9; x++) cells[y * cols + x] = 1
    const mini: Doc = {
      ...baseDoc,
      cols,
      rows,
      sub: 1,
      cells,
      links: [],
      styleScope: 'global',
      style: style.style,
      renderMode: style.renderMode,
      connectivity: style.connectivity,
      metaball: style.metaball,
      texture: style.texture,
      layers: null,
      cellObj: null,
      elements: [],
    }
    const { w: dw, h: dh } = { w: cols, h: rows }
    g.save()
    g.scale(w / dw, h / dh)
    drawGeometry(g, buildGeometry(mini).paths)
    g.restore()
  }, [key, w, h])
  return <canvas ref={ref} style={{ width: w, height: h }} className="border-line rounded border" />
}
