/** Halftone node: re-renders the input's tones as a screen of marks — one ink, or the source colors. */

import {
  latticePoints,
  screenShapeOn,
  SCREEN_LATTICES,
  type ScreenLattice,
  type ScreenMark,
  type ScreenStyle,
} from '../screen-engine.ts'
import { hash2 } from '../texture-core.ts'
import { defineNode, type Cells } from './types.ts'

const MARKS: readonly ScreenMark[] = [
  'circle',
  'square',
  'diamond',
  'triangle',
  'hexagon',
  'star',
  'cross',
  'ring',
  'heart',
  'capsule',
]

export const HALFTONE_NODES = [
  defineNode({
    id: 'mod.halftone',
    kind: 'mod',
    domain: { in: 'raster', out: 'raster' },
    label: 'Halftone',
    category: 'transform',
    tags: ['dither', 'halftone', 'screen', 'dots', 'stipple', 'print', 'engraving'],
    params: {
      lattice: { kind: 'select', options: SCREEN_LATTICES, default: 'grid' },
      mark: { kind: 'select', options: MARKS, default: 'circle' },
      mode: { kind: 'select', options: ['size', 'density', 'twist'] as const, default: 'size' },
      pitch: { kind: 'int', min: 1, max: 64, default: 3, span: 'size' },
      twist: { kind: 'int', min: 0, max: 720, default: 180 },
      color: { kind: 'hex', default: '#262626' },
      keepColor: { kind: 'bool', default: false },
      invert: { kind: 'bool', default: false },
      seed: { kind: 'int', min: 0, max: 9999, default: 1 },
    },
    evaluate: (ctx, p, input) => {
      const out: Cells = new Map()
      const pitch = Math.max(1, p.int('pitch'))
      const invert = p.bool('invert')
      const style: ScreenStyle = {
        lattice: p.str('lattice') as ScreenLattice,
        mark: p.str('mark') as ScreenMark,
        mode: p.str('mode') as ScreenStyle['mode'],
        pitch,
        twist: p.int('twist'),
        seed: p.int('seed'),
      }
      // ink coverage under a cell: empty = paper, ink = darkness of its palette color
      const toneAt = (x: number, y: number): number => {
        const v = input.get(y * ctx.bw + x)
        if (v === undefined) return invert ? 1 : 0
        const t = 1 - ctx.luma(v)
        return invert ? 1 - t : t
      }
      const ink = ctx.hexValue(p.str('color'))
      const keep = p.bool('keepColor')
      for (const pt of latticePoints(style.lattice, pitch, style.seed, ctx.bw, ctx.bh)) {
        const cx = Math.min(ctx.bw - 1, Math.max(0, Math.floor(pt.x)))
        const cy = Math.min(ctx.bh - 1, Math.max(0, Math.floor(pt.y)))
        const t = toneAt(cx, cy)
        if (t <= 0) continue
        if (style.mode === 'density') {
          const h = hash2(Math.round(pt.x * 64), Math.round(pt.y * 64), style.seed) / 4_294_967_296
          if (h >= t) continue
        }
        const rotation = style.mode === 'twist' ? t * style.twist : 0
        const scale = style.mode === 'size' ? Math.min(1, Math.sqrt(t)) : 0.92
        if (scale <= 0.02) continue
        const half = (pitch * scale) / 2
        const x0 = Math.max(0, Math.floor(pt.x - half))
        const x1 = Math.min(ctx.bw - 1, Math.ceil(pt.x + half))
        const y0 = Math.max(0, Math.floor(pt.y - half))
        const y1 = Math.min(ctx.bh - 1, Math.ceil(pt.y + half))
        const value = keep ? (input.get(cy * ctx.bw + cx) ?? ink) : ink
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const u = (x + 0.5 - (pt.x - pitch / 2)) / pitch
            const v = (y + 0.5 - (pt.y - pitch / 2)) / pitch
            if (screenShapeOn(style.mark, u, v, scale, rotation)) out.set(y * ctx.bw + x, value)
          }
        }
      }
      return out
    },
  }),
]
