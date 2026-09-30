/** Generator nodes: whole-buffer parametric patterns (nets, meshes, tilings) as raster sources. */

import { combineCells } from './context.ts'
import { defineNode, type Cells } from './types.ts'

const MODE = {
  kind: 'select',
  options: ['add', 'subtract', 'intersect'] as const,
  default: 'add',
} as const

export const GENERATOR_NODES = [
  defineNode({
    id: 'source.grid',
    kind: 'source',
    domain: { in: 'none', out: 'raster' },
    label: 'Grid pattern',
    category: 'sources',
    tags: ['checker', 'dots', 'lines', 'diagonal', 'mesh', 'net', 'honeycomb', 'weave'],
    params: {
      pattern: {
        kind: 'select',
        options: ['checker', 'dots', 'linesH', 'linesV', 'diagonal', 'honeycomb'] as const,
        default: 'checker',
      },
      period: { kind: 'int', min: 2, max: 64, default: 4 },
      thickness: { kind: 'number', min: 0.05, max: 1, default: 0.5 },
      phase: { kind: 'int', min: 0, max: 63, default: 0 },
      color: { kind: 'hex', default: '#e63946' },
      mode: MODE,
    },
    evaluate: (ctx, p, input) => {
      const cells: Cells = new Map()
      const v = ctx.hexValue(p.str('color'))
      const period = Math.max(2, p.int('period'))
      const ph = ((p.int('phase') % period) + period) % period
      const t = Math.max(1, Math.round(p.num('thickness') * period)) // inked band in cells
      const pat = p.str('pattern')
      // honeycomb: hex-packed dots — bands ¾ of the period tall, odd bands shifted half a period
      const band = Math.max(1, Math.round(period * 0.75))
      const dotR = Math.max(0.5, p.num('thickness') * Math.min(period, band) * 0.5)
      for (let y = 0; y < ctx.bh; y++) {
        for (let x = 0; x < ctx.bw; x++) {
          let on: boolean
          if (pat === 'checker') {
            on = (Math.floor((x + ph) / period) + Math.floor((y + ph) / period)) % 2 === 0
          } else if (pat === 'dots') {
            on =
              (x + ph) % period === Math.floor(period / 2) &&
              (y + ph) % period === Math.floor(period / 2)
          } else if (pat === 'linesH') {
            on = (y + ph) % period < t
          } else if (pat === 'linesV') {
            on = (x + ph) % period < t
          } else if (pat === 'diagonal') {
            on = (((x + y + 2 * ph) % period) + period) % period < t
          } else {
            // honeycomb
            const row = Math.floor((y + ph) / band)
            const shift = (row % 2) * Math.floor(period / 2)
            let dx = Math.abs(((((x + ph + shift) % period) + period) % period) - period / 2)
            dx = Math.min(dx, period - dx)
            const dy = Math.abs(((y + ph) % band) - (band - 1) / 2)
            on = dx * dx + dy * dy <= dotR * dotR
          }
          if (on) cells.set(y * ctx.bw + x, v)
        }
      }
      return combineCells(input, cells, p.str('mode'))
    },
  }),
]
