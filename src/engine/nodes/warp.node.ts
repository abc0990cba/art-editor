/** Warp node: bends the accumulated pixels through a displacement field (bulge, twirl, waves…). */

import { inkBox, warpInk, WARP_KINDS, type WarpKind } from '../effects/warp.ts'
import { defineNode } from './types.ts'

export const WARP_NODES = [
  defineNode({
    id: 'mod.warp',
    kind: 'mod',
    domain: { in: 'raster', out: 'raster' },
    label: 'Warp',
    category: 'transform',
    tags: [
      'warp',
      'distort',
      'lens',
      'bulge',
      'pinch',
      'fisheye',
      'twirl',
      'wave',
      'zigzag',
      'polar',
    ],
    params: {
      kind: { kind: 'select', options: WARP_KINDS, default: 'bulge' },
      amount: { kind: 'int', min: -100, max: 100, default: 40 },
      radiusPct: { kind: 'int', min: 10, max: 200, default: 100 },
      wavelength: { kind: 'int', min: 2, max: 256, default: 12 },
      seed: { kind: 'int', min: 0, max: 9999, default: 7 },
    },
    evaluate: (ctx, p, input) => {
      // the field centers on the ink's own bounding box, so the node is placement-independent
      const box = inkBox(input, ctx.bw)
      if (!box) return new Map()
      return warpInk(
        input,
        p.str('kind') as WarpKind,
        {
          amount: p.int('amount'),
          radiusPct: p.int('radiusPct'),
          wavelength: p.int('wavelength'),
          seed: p.int('seed'),
        },
        { box, bw: ctx.bw, bh: ctx.bh },
      )
    },
  }),
]
