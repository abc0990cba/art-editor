/** Transform nodes: move or mirror the accumulated pixels. */

import { defineNode } from '../types'
import { symmetryPoints } from '../../symmetry'

export const TRANSFORM_NODES = [
  defineNode({
    id: 'mod.recolor',
    kind: 'mod',
    domain: { in: 'raster', out: 'raster' },
    label: 'Recolor',
    category: 'transform',
    tags: ['color', 'recolor', 'paint', 'fill'],
    params: {
      color: { kind: 'hex', default: '#2a9d8f' },
    },
    evaluate: (ctx, p, input) => {
      const v = ctx.hexValue(p.str('color'))
      const out = new Map<number, number>()
      for (const [i] of input) out.set(i, v)
      return out
    },
  }),
  defineNode({
    id: 'mod.offset',
    kind: 'mod',
    domain: { in: 'raster', out: 'raster' },
    label: 'Offset',
    category: 'transform',
    tags: ['move', 'shift', 'translate'],
    params: {
      dx: { kind: 'int', min: -2048, max: 2048, default: 2, span: 'delta' },
      dy: { kind: 'int', min: -2048, max: 2048, default: 0, span: 'delta' },
    },
    evaluate: (ctx, p, input) => {
      const out = new Map<number, number>()
      const dx = p.int('dx')
      const dy = p.int('dy')
      for (const [i, v] of input) {
        const x = (i % ctx.bw) + dx
        const y = Math.floor(i / ctx.bw) + dy
        if (x >= 0 && y >= 0 && x < ctx.bw && y < ctx.bh) out.set(y * ctx.bw + x, v)
      }
      return out
    },
  }),
  defineNode({
    id: 'mod.symmetry',
    kind: 'mod',
    domain: { in: 'raster', out: 'raster' },
    label: 'Symmetry',
    category: 'transform',
    tags: ['mirror', 'kaleidoscope', 'radial', 'quad'],
    params: {
      mode: {
        kind: 'select',
        options: ['mirrorX', 'mirrorY', 'quad', 'diag8', 'radial'] as const,
        default: 'quad',
      },
      n: { kind: 'int', min: 2, max: 24, default: 8 },
    },
    evaluate: (ctx, p, input) => {
      const out = new Map<number, number>()
      const mode = p.str('mode') as Parameters<typeof symmetryPoints>[4]
      const n = p.int('n')
      for (const [i, v] of input) {
        const x = i % ctx.bw
        const y = Math.floor(i / ctx.bw)
        for (const [sx, sy] of symmetryPoints(x, y, ctx.bw, ctx.bh, mode, n, 16, undefined)) {
          out.set(sy * ctx.bw + sx, v)
        }
      }
      return out
    },
  }),
]
