/** The pen tool's parametric source: regenerates a Bézier path draft from its serialized `d`. */

import { pathFromD, pathInk } from '../curves/index.ts'
import { combineCells } from './context.ts'
import { defineNode, type Cells } from './types.ts'

const MODE = {
  kind: 'select',
  options: ['add', 'subtract', 'intersect'] as const,
  default: 'add',
} as const

export const BEZIER_NODES = [
  defineNode({
    id: 'source.bezier',
    kind: 'source',
    domain: { in: 'none', out: 'raster' },
    label: 'Bezier',
    category: 'sources',
    tags: ['pen', 'bezier', 'curve', 'path', 'spline'],
    params: {
      // the pen tool's serialized draft (pathToD): anchors + handles, edited on canvas
      d: { kind: 'string', default: 'M 3 12 C 6 4 10 4 13 12', maxLength: 20_000 },
      w: { kind: 'int', min: 1, max: 16, default: 1 },
      stroke: { kind: 'bool', default: true },
      fillMode: { kind: 'select', options: ['none', 'solid', 'pattern'], default: 'none' },
      strokeColor: { kind: 'hex', default: '#e63946' },
      fillColor: { kind: 'hex', default: '#e63946' },
      mode: MODE,
    },
    evaluate: (ctx, p, input) => {
      const cells: Cells = new Map()
      const path = pathFromD(p.str('d'))
      if (path) {
        // the same raster the pen previewed, so the committed parametric object
        // regenerates exactly the pixels the user saw (and re-edits cleanly)
        const fillOn = p.str('fillMode') !== 'none' && path.closed
        const strokeOn = p.bool('stroke') || p.str('fillMode') === 'none'
        const vFill = fillOn ? ctx.hexValue(p.str('fillColor')) : 0
        const vOut = strokeOn ? ctx.hexValue(p.str('strokeColor')) : vFill
        const ink = pathInk(path, ctx.bw, ctx.bh, { width: p.int('w'), fill: fillOn })
        for (const i of ink.fill) cells.set(i, vFill)
        for (const i of ink.stroke) cells.set(i, vOut)
      }
      return combineCells(input, cells, p.str('mode'))
    },
  }),
]
