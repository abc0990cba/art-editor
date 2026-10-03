/**
 * Text source: rasterize the embedded 5×7 bitmap font into ink cells — captions without a font
 * stack.
 */

import { textTiles } from '../glyph/text-raster.ts'
import { defineNode, type Cells } from './types.ts'

export const TEXT_NODES = [
  defineNode({
    id: 'source.text',
    kind: 'source',
    domain: { in: 'none', out: 'raster' },
    label: 'Text',
    category: 'source',
    tags: ['text', 'ascii', 'font', 'type', 'caption', 'letter', 'word'],
    params: {
      text: { kind: 'string', default: 'DITHER', maxLength: 120 },
      dx: { kind: 'int', min: -4096, max: 4096, default: 1, span: 'delta' },
      dy: { kind: 'int', min: -4096, max: 4096, default: 1, span: 'delta' },
      scale: { kind: 'int', min: 1, max: 16, default: 2, span: 'size' },
      tracking: { kind: 'int', min: 0, max: 8, default: 1 },
      color: { kind: 'hex', default: '#262626' },
    },
    evaluate: (ctx, p, _input) => {
      const out: Cells = new Map()
      const { w, h, tiles } = textTiles(p.str('text'), p.int('tracking'))
      const scale = Math.max(1, p.int('scale'))
      const dx = p.int('dx')
      const dy = p.int('dy')
      const v = ctx.hexValue(p.str('color'))
      for (let ty = 0; ty < h; ty++) {
        for (let tx = 0; tx < w; tx++) {
          if (!tiles[ty * w + tx]) continue
          const px = dx + tx * scale
          const py = dy + ty * scale
          stampRect(out, ctx.bw, v, {
            x0: Math.max(0, px),
            x1: Math.min(ctx.bw - 1, px + scale - 1),
            y0: Math.max(0, py),
            y1: Math.min(ctx.bh - 1, py + scale - 1),
          })
        }
      }
      return out
    },
  }),
]

/** Fill one clamped pixel rect with a palette value. */
function stampRect(
  out: Cells,
  bw: number,
  v: number,
  r: { x0: number; x1: number; y0: number; y1: number },
): void {
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) out.set(y * bw + x, v)
  }
}
