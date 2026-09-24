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
  defineNode({
    id: 'mod.path',
    kind: 'mod',
    domain: { in: 'raster', out: 'raster' },
    label: 'Place along path',
    category: 'repeat',
    tags: ['path', 'curve', 'place', 'distribute', 'arc', 'sine', 'clone', 'march'],
    params: {
      count: { kind: 'int', min: 1, max: 64, default: 5 },
      pathType: {
        kind: 'select',
        options: ['line', 'arc', 'sine'],
        default: 'line',
      },
      spanX: { kind: 'number', min: -1024, max: 1024, default: 16, span: 'delta' },
      spanY: { kind: 'number', min: -1024, max: 1024, default: 0, span: 'delta' },
      rotateCopies: { kind: 'bool', default: true },
      scaleStart: { kind: 'number', min: 0.1, max: 4, default: 1 },
      scaleEnd: { kind: 'number', min: 0.1, max: 4, default: 1 },
      jitter: { kind: 'number', min: 0, max: 100, default: 0 },
      seed: { kind: 'int', min: 1, max: 9999, default: 1 },
    },
    evaluate: (ctx, p, input) => {
      const out = new Map<number, number>()
      const count = p.int('count')
      const spanX = p.num('spanX')
      const spanY = p.num('spanY')
      const rotate = p.bool('rotateCopies')
      const s0 = p.num('scaleStart')
      const s1 = p.num('scaleEnd')
      const jitter = p.num('jitter') / 100
      if (input.size === 0) return out

      // pivot: center of the input's own bbox — copies are stamped around the path point
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const [i] of input) {
        const x = i % ctx.bw
        const y = Math.floor(i / ctx.bw)
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
      }
      const px = (minX + maxX + 1) / 2
      const py = (minY + maxY + 1) / 2

      for (let k = 0; k < count; k++) {
        const u = count === 1 ? 0 : k / (count - 1)
        let pos: [number, number]
        let tangent = 0
        if (p.str('pathType') === 'arc') {
          // quadratic bezier (0,0) → (spanX, spanY) with a control that bows by spanY
          const cxp = spanX / 2
          const cyp = -spanY
          pos = [2 * (1 - u) * u * cxp + u * u * spanX, 2 * (1 - u) * u * cyp + u * u * spanY]
          const dx = 2 * (1 - u) * cxp + 2 * u * (spanX - cxp)
          const dy = 2 * (1 - u) * cyp + 2 * u * (spanY - cyp)
          tangent = Math.atan2(dy, dx)
        } else if (p.str('pathType') === 'sine') {
          pos = [u * spanX, u * spanY * 0.5 + Math.sin(u * Math.PI * 2) * spanY * 0.5]
          const dy = spanY * 0.5 + Math.cos(u * Math.PI * 2) * spanY * Math.PI
          tangent = Math.atan2(dy, spanX)
        } else {
          pos = [u * spanX, u * spanY]
          tangent = Math.atan2(spanY, spanX)
        }
        const seed = p.int('seed')
        const jx = jitter > 0 ? (ctx.rng(`jx${seed}-${k}`) - 0.5) * jitter * 8 : 0
        const jy = jitter > 0 ? (ctx.rng(`jy${seed}-${k}`) - 0.5) * jitter * 8 : 0
        const ang = rotate ? tangent : 0
        const cos = Math.cos(ang)
        const sin = Math.sin(ang)
        const sc = s0 + (s1 - s0) * u
        for (const [i, v] of input) {
          const x = i % ctx.bw
          const y = Math.floor(i / ctx.bw)
          const rx = x + 0.5 - px
          const ry = y + 0.5 - py
          const sx = rx * sc * cos - ry * sc * sin + pos[0] + jx
          const sy = rx * sc * sin + ry * sc * cos + pos[1] + jy
          const nx = Math.floor(sx)
          const ny = Math.floor(sy)
          if (nx >= 0 && ny >= 0 && nx < ctx.bw && ny < ctx.bh) out.set(ny * ctx.bw + nx, v)
        }
      }
      return out
    },
  }),
  defineNode({
    id: 'mod.scale',
    kind: 'mod',
    domain: { in: 'raster', out: 'raster' },
    label: 'Scale',
    category: 'transform',
    tags: ['scale', 'resize', 'zoom', 'compose'],
    params: {
      sx: { kind: 'number', min: 0.1, max: 4, default: 2 },
      sy: { kind: 'number', min: 0.1, max: 4, default: 2 },
      cx: { kind: 'number', min: -1024, max: 3072, default: 16, span: 'x' },
      cy: { kind: 'number', min: -1024, max: 3072, default: 16, span: 'y' },
    },
    evaluate: (ctx, p, input) => {
      const out = new Map<number, number>()
      const sx = p.num('sx')
      const sy = p.num('sy')
      const cx = p.num('cx')
      const cy = p.num('cy')
      for (const [i, v] of input) {
        const x = i % ctx.bw
        const y = Math.floor(i / ctx.bw)
        const nx = Math.floor(cx + (x + 0.5 - cx) * sx)
        const ny = Math.floor(cy + (y + 0.5 - cy) * sy)
        if (nx >= 0 && ny >= 0 && nx < ctx.bw && ny < ctx.bh) out.set(ny * ctx.bw + nx, v)
      }
      return out
    },
  }),
]
