/** Hatch node: re-renders the input's tones as parallel screen lines — one system or crossed. */

import { hatchDistance, type HatchSystem } from '../screen-lines.ts'
import { defineNode, type Cells } from './types.ts'

export const HATCH_NODES = [
  defineNode({
    id: 'mod.hatch',
    kind: 'mod',
    domain: { in: 'raster', out: 'raster' },
    label: 'Hatch',
    category: 'transform',
    tags: ['hatch', 'engraving', 'lines', 'crosshatch', 'screen', 'print', 'waves'],
    params: {
      angle: { kind: 'int', min: 0, max: 180, default: 45 },
      pitch: { kind: 'int', min: 1, max: 64, default: 4, span: 'size' },
      width: { kind: 'int', min: 2, max: 95, default: 45 },
      cross: { kind: 'bool', default: false },
      wave: { kind: 'int', min: 0, max: 100, default: 0 },
      waveLen: { kind: 'int', min: 2, max: 128, default: 24, span: 'size' },
      color: { kind: 'hex', default: '#262626' },
      keepColor: { kind: 'bool', default: false },
      invert: { kind: 'bool', default: false },
    },
    evaluate: (ctx, p, input) => {
      const out: Cells = new Map()
      const pitch = Math.max(1, p.int('pitch'))
      const waveAmp = (p.int('wave') / 100) * pitch * 0.5
      const main: HatchSystem = {
        angle: p.int('angle'),
        spacing: pitch,
        phase: 0,
        waveAmp,
        waveLen: p.int('waveLen'),
      }
      const systems: HatchSystem[] = p.bool('cross')
        ? [main, { ...main, angle: (main.angle + 90) % 180 }]
        : [main]
      const invert = p.bool('invert')
      const keep = p.bool('keepColor')
      const ink = ctx.hexValue(p.str('color'))
      const half = (pitch * (p.int('width') / 100)) / 2
      // ink coverage under the cell: empty = paper, ink = darkness of its palette color
      const toneAt = (v: number | undefined): number => {
        if (v === undefined) return invert ? 1 : 0
        const t = 1 - ctx.luma(v)
        return invert ? 1 - t : t
      }
      for (let y = 0; y < ctx.bh; y++) {
        for (let x = 0; x < ctx.bw; x++) {
          const v = input.get(y * ctx.bw + x)
          const t = toneAt(v)
          if (t <= 0) continue
          const hw = half * Math.sqrt(t)
          let on = false
          for (const sys of systems) {
            if (hatchDistance(sys, x + 0.5, y + 0.5) <= hw) {
              on = true
              break
            }
          }
          if (on) out.set(y * ctx.bw + x, keep ? (v ?? ink) : ink)
        }
      }
      return out
    },
  }),
]
