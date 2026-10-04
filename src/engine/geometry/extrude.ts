import { paletteLuma } from '../color/color.ts'
import { bufferHeight, bufferWidth, cellColor, type Doc, type Link } from '../core/doc.ts'
import { shapeGeometry } from './shape.ts'
import type { Geometry, StyledPath } from './types.ts'

/* ---------------------------------- extrude mode ---------------------------------- */

const fmt = (v: number) => String(Math.round(v * 1000) / 1000)

const rect = (x: number, y: number, w: number, h: number): string =>
  `M${fmt(x)} ${fmt(y)}h${fmt(w)}v${fmt(h)}h${fmt(-w)}Z`

/** Hex of the darkest palette color — the auto extrusion body (`extrude.color === 0`). */
function darkestOf(palette: readonly string[]): string {
  let best = 1
  let bestL = Infinity
  for (let v = 1; v <= palette.length; v++) {
    const l = paletteLuma(palette, v)
    if (l < bestL) {
      bestL = l
      best = v
    }
  }
  return palette[best - 1] ?? '#000000'
}

/**
 * 2.5D extrusion (extrude render mode): every painted cell grows a flat body of `extrude.depth`
 * buffer cells along one 8-way direction into empty space, drawn as one merged rect path BEFORE the
 * regular pixels-mode fill — the classic pixel-art side face. Rays stop at the canvas border and at
 * any painted cell (the body stays behind the ink). The body color is `extrude.color` or, when 0,
 * the darkest palette color.
 */
export function extrudeGeometry(doc: Doc, cells: Uint16Array, links: readonly Link[]): Geometry {
  const bw = bufferWidth(doc)
  const bh = bufferHeight(doc)
  const sub = doc.sub
  const depth = Math.max(1, Math.min(8, Math.round(doc.extrude.depth)))
  const dx = Math.max(-1, Math.min(1, Math.round(doc.extrude.dx)))
  const dy = Math.max(-1, Math.min(1, Math.round(doc.extrude.dy)))
  const mask = new Uint8Array(cells.length)
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      if (cells[by * bw + bx] === 0) continue
      let x = bx
      let y = by
      for (let k = 0; k < depth; k++) {
        x += dx
        y += dy
        if (x < 0 || y < 0 || x >= bw || y >= bh) break
        const j = y * bw + x
        if (cells[j] !== 0) break
        mask[j] = 1
      }
    }
  }
  const body =
    doc.extrude.color > 0
      ? (cellColor(doc, doc.extrude.color) ?? darkestOf(doc.palette))
      : darkestOf(doc.palette)
  let d = ''
  for (let by = 0; by < bh; by++) {
    let bx = 0
    while (bx < bw) {
      if (mask[by * bw + bx] === 0) {
        bx++
        continue
      }
      let end = bx + 1
      while (end < bw && mask[by * bw + end] === 1) end++
      d += rect(bx / sub, by / sub, (end - bx) / sub, 1 / sub)
      bx = end
    }
  }
  const paths: StyledPath[] = d ? [{ d, fill: body }] : []
  paths.push(...shapeGeometry(doc, cells, links).paths)
  return { paths }
}
