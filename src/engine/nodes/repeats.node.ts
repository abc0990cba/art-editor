/** Repeat nodes: replicate the accumulated pixels — linear and circular arrays. */

import { defineNode } from './types.ts'

export const REPEAT_NODES = [
  defineNode({
    id: 'mod.arrayGrid',
    kind: 'mod',
    domain: { in: 'raster', out: 'raster' },
    label: 'Linear array',
    category: 'repeat',
    tags: ['array', 'repeat', 'grid', 'clone'],
    params: {
      count: { kind: 'int', min: 1, max: 32, default: 3 },
      dx: { kind: 'int', min: -512, max: 512, default: 4 },
      dy: { kind: 'int', min: -512, max: 512, default: 0 },
    },
    evaluate: (ctx, p, input) => {
      const out = new Map<number, number>()
      const count = p.int('count')
      const dx = p.int('dx')
      const dy = p.int('dy')
      for (let k = 0; k < count; k++) {
        const ox = dx * k
        const oy = dy * k
        for (const [i, v] of input) {
          const x = (i % ctx.bw) + ox
          const y = Math.floor(i / ctx.bw) + oy
          if (x >= 0 && y >= 0 && x < ctx.bw && y < ctx.bh) out.set(y * ctx.bw + x, v)
        }
      }
      return out
    },
  }),
  defineNode({
    id: 'mod.arrayCircle',
    kind: 'mod',
    domain: { in: 'raster', out: 'raster' },
    label: 'Circular array',
    category: 'repeat',
    tags: ['array', 'circle', 'rotate', 'radial', 'clone'],
    params: {
      count: { kind: 'int', min: 1, max: 64, default: 6 },
      cx: { kind: 'number', min: -1024, max: 3072, default: 16 },
      cy: { kind: 'number', min: -1024, max: 3072, default: 16 },
    },
    evaluate: (ctx, p, input) => {
      const out = new Map<number, number>()
      const count = p.int('count')
      const cx = p.num('cx')
      const cy = p.num('cy')
      for (let k = 0; k < count; k++) {
        const a = (k / count) * Math.PI * 2
        const cos = Math.cos(a)
        const sin = Math.sin(a)
        for (const [i, v] of input) {
          const x = i % ctx.bw
          const y = Math.floor(i / ctx.bw)
          const rx = x + 0.5 - cx
          const ry = y + 0.5 - cy
          const nx = Math.floor(cx + rx * cos - ry * sin)
          const ny = Math.floor(cy + rx * sin + ry * cos)
          if (nx >= 0 && ny >= 0 && nx < ctx.bw && ny < ctx.bh) out.set(ny * ctx.bw + nx, v)
        }
      }
      return out
    },
  }),
]
