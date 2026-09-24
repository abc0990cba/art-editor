/** Ramp nodes: recolor the accumulated pixels by position (the Color Ramp analog). */

import { defineNode } from './types.ts'

export const RAMP_NODES = [
  defineNode({
    id: 'ramp.gradient',
    kind: 'ramp',
    domain: { in: 'raster', out: 'raster' },
    label: 'Gradient',
    category: 'ramp',
    tags: ['gradient', 'color ramp', 'ramp', 'recolor'],
    params: {
      angle: { kind: 'number', min: 0, max: 180, default: 0 },
      from: { kind: 'int', min: 1, max: 64, default: 1 },
      to: { kind: 'int', min: 1, max: 64, default: 2 },
    },
    evaluate: (ctx, p, input) => {
      if (input.size === 0) return input
      const angle = (p.num('angle') * Math.PI) / 180
      const ax = Math.cos(angle)
      const ay = Math.sin(angle)
      let min = Infinity
      let max = -Infinity
      const keys = [...input.keys()]
      const projs = keys.map((i) => {
        const t = ((i % ctx.bw) + 0.5) * ax + (Math.floor(i / ctx.bw) + 0.5) * ay
        if (t < min) min = t
        if (t > max) max = t
        return t
      })
      const span = max - min || 1
      const from = p.int('from')
      const to = p.int('to')
      const out = new Map<number, number>()
      keys.forEach((i, k) => {
        const t = (projs[k] - min) / span
        out.set(i, Math.max(1, Math.min(ctx.paletteLen, Math.round(from + (to - from) * t))))
      })
      return out
    },
  }),
]
