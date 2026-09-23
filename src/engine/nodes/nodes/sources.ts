/** Source nodes: paint colored pixels onto the accumulated map (add/subtract/intersect). */

import { defineNode, Resolved, type Cells, type NodeParamSpec } from '../types'
import { combineCells } from '../context'
import { regionCells } from '../../shapefill'
import { linePoints, shapePathPoints, type ShapeOpts, type ShapeToolId } from '../../shapes'

const MODE = {
  kind: 'select',
  options: ['add', 'subtract', 'intersect'] as const,
  default: 'add',
} as const

/** Per-tool geometry knobs: same names as ShapeOpts, defaults as the tool settings. */
const SHAPE_TOOL_PARAMS: Record<string, NodeParamSpec> = Object.fromEntries(
  (
    [
      ['starRays', 'int', 3, 24, 5],
      ['starInner', 'number', 0.05, 0.9, 0.42],
      ['starRotation', 'number', -359, 359, 0],
      ['polygonSides', 'int', 3, 24, 6],
      ['polygonRotation', 'number', -359, 359, 0],
      ['diamondRotation', 'number', -359, 359, 0],
      ['heartRotation', 'number', -359, 359, 0],
      ['spiralTurns', 'number', 0.5, 12, 2.75],
      ['spiralDir', 'int', -1, 1, 1],
      ['spiralRotation', 'number', -359, 359, 0],
      ['arrowHead', 'number', 0.1, 0.9, 0.35],
      ['arrowSpread', 'number', 0.1, 2, 0.6],
      ['lightningRotation', 'number', -359, 359, 0],
      ['moonThickness', 'number', 0.05, 0.45, 0.293],
      ['moonRotation', 'number', -359, 359, 0],
      ['wavePeriods', 'number', 0.5, 12, 3],
      ['waveAmplitude', 'number', 0.01, 1, 0.15],
      ['crossThickness', 'number', 0.05, 0.95, 0.333],
      ['crossRotation', 'number', -359, 359, 0],
      ['flowerPetals', 'int', 3, 24, 5],
      ['flowerRotation', 'number', -359, 359, 0],
      ['gearTeeth', 'int', 3, 36, 8],
      ['gearDepth', 'number', 0.02, 0.6, 0.14],
      ['gearRotation', 'number', -359, 359, 0],
      ['sunRays', 'int', 3, 36, 12],
      ['sunCore', 'number', 0.02, 0.8, 0.18],
      ['sunRayBase', 'number', 0.02, 0.9, 0.22],
      ['sunRayLength', 'number', 0.2, 1.5, 1],
      ['sunAlternate', 'number', 0.2, 2, 1],
      ['sunTaper', 'number', 0, 1, 0],
      ['sunWidth', 'number', 0.05, 1, 0.55],
      ['sunWave', 'number', 0, 1, 0],
      ['sunWavePeriods', 'number', 0.5, 8, 2],
      ['sunTwist', 'number', -1, 1, 0],
      ['sunRotation', 'number', -359, 359, 0],
      ['bentoCols', 'int', 1, 8, 3],
      ['bentoRows', 'int', 1, 8, 3],
      ['bentoGap', 'number', 0, 0.4, 0.08],
      ['bentoRadius', 'number', 0, 0.5, 0.15],
      ['bentoInset', 'number', 0, 0.4, 0],
      ['bentoChaos', 'number', 0, 1, 0],
      ['bentoMerge', 'number', 0, 1, 0],
      ['bentoSeed', 'int', 1, 999, 1],
      ['shapeCorner', 'number', 0, 0.5, 0],
      ['shapeBulge', 'number', -1, 1, 0],
      ['ringThickness', 'number', 0.05, 0.9, 0.25],
    ] as Array<[string, 'int' | 'number', number, number, number]>
  ).map(([key, kind, min, max, def]) => [key, { kind, min, max, default: def } satisfies NodeParamSpec]),
)

function shapeOptsFrom(p: Resolved): ShapeOpts {
  return {
    starRays: p.num('starRays'),
    starInner: p.num('starInner'),
    starRotation: p.num('starRotation'),
    polygonSides: p.num('polygonSides'),
    polygonRotation: p.num('polygonRotation'),
    diamondRotation: p.num('diamondRotation'),
    heartRotation: p.num('heartRotation'),
    spiralTurns: p.num('spiralTurns'),
    spiralDir: p.int('spiralDir'),
    spiralRotation: p.num('spiralRotation'),
    arrowHead: p.num('arrowHead'),
    arrowSpread: p.num('arrowSpread'),
    lightningRotation: p.num('lightningRotation'),
    moonThickness: p.num('moonThickness'),
    moonRotation: p.num('moonRotation'),
    wavePeriods: p.num('wavePeriods'),
    waveAmplitude: p.num('waveAmplitude'),
    crossThickness: p.num('crossThickness'),
    crossRotation: p.num('crossRotation'),
    flowerPetals: p.num('flowerPetals'),
    flowerRotation: p.num('flowerRotation'),
    gearTeeth: p.num('gearTeeth'),
    gearDepth: p.num('gearDepth'),
    gearRotation: p.num('gearRotation'),
    sunRays: p.num('sunRays'),
    sunCore: p.num('sunCore'),
    sunRayBase: p.num('sunRayBase'),
    sunRayLength: p.num('sunRayLength'),
    sunAlternate: p.num('sunAlternate'),
    sunTaper: p.num('sunTaper'),
    sunWidth: p.num('sunWidth'),
    sunWave: p.num('sunWave'),
    sunWavePeriods: p.num('sunWavePeriods'),
    sunTwist: p.num('sunTwist'),
    sunRotation: p.num('sunRotation'),
    bentoCols: p.int('bentoCols'),
    bentoRows: p.int('bentoRows'),
    bentoGap: p.num('bentoGap'),
    bentoRadius: p.num('bentoRadius'),
    bentoInset: p.num('bentoInset'),
    bentoChaos: p.num('bentoChaos'),
    bentoMerge: p.num('bentoMerge'),
    bentoSeed: p.int('bentoSeed'),
    shapeCorner: p.num('shapeCorner'),
    shapeBulge: p.num('shapeBulge'),
    ringThickness: p.num('ringThickness'),
  }
}

export const SOURCE_NODES = [
  defineNode({
    id: 'source.rect',
    kind: 'source',
    domain: { in: 'none', out: 'raster' },
    label: 'Rectangle',
    category: 'sources',
    tags: ['rect', 'box', 'fill'],
    params: {
      x: { kind: 'int', min: 0, max: 2048, default: 4, span: 'x' },
      y: { kind: 'int', min: 0, max: 2048, default: 4, span: 'y' },
      w: { kind: 'int', min: 1, max: 2048, default: 8, span: 'size' },
      h: { kind: 'int', min: 1, max: 2048, default: 8, span: 'size' },
      color: { kind: 'hex', default: '#e63946' },
      mode: MODE,
    },
    evaluate: (ctx, p, input) => {
      const cells: Cells = new Map()
      const v = ctx.hexValue(p.str('color'))
      const x0 = Math.max(0, p.int('x'))
      const y0 = Math.max(0, p.int('y'))
      const x1 = Math.min(ctx.bw, p.int('x') + p.int('w'))
      const y1 = Math.min(ctx.bh, p.int('y') + p.int('h'))
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) cells.set(y * ctx.bw + x, v)
      return combineCells(input, cells, p.str('mode'))
    },
  }),
  defineNode({
    id: 'source.line',
    kind: 'source',
    domain: { in: 'none', out: 'raster' },
    label: 'Line',
    category: 'sources',
    tags: ['line', 'segment', 'stroke'],
    params: {
      x0: { kind: 'number', min: -1024, max: 3072, default: 2, span: 'x' },
      y0: { kind: 'number', min: -1024, max: 3072, default: 2, span: 'y' },
      x1: { kind: 'number', min: -1024, max: 3072, default: 13, span: 'x' },
      y1: { kind: 'number', min: -1024, max: 3072, default: 13, span: 'y' },
      color: { kind: 'hex', default: '#e63946' },
      mode: MODE,
    },
    evaluate: (ctx, p, input) => {
      const cells: Cells = new Map()
      const v = ctx.hexValue(p.str('color'))
      for (const [x, y] of linePoints(p.num('x0'), p.num('y0'), p.num('x1'), p.num('y1'))) {
        if (x >= 0 && y >= 0 && x < ctx.bw && y < ctx.bh) cells.set(y * ctx.bw + x, v)
      }
      return combineCells(input, cells, p.str('mode'))
    },
  }),
  defineNode({
    id: 'source.ellipse',
    kind: 'source',
    domain: { in: 'none', out: 'raster' },
    label: 'Ellipse',
    category: 'sources',
    tags: ['ellipse', 'circle', 'oval'],
    params: {
      cx: { kind: 'number', min: -1024, max: 3072, default: 8, span: 'x' },
      cy: { kind: 'number', min: -1024, max: 3072, default: 8, span: 'y' },
      rx: { kind: 'number', min: 0.5, max: 1024, default: 4, span: 'size' },
      ry: { kind: 'number', min: 0.5, max: 1024, default: 4, span: 'size' },
      color: { kind: 'hex', default: '#e63946' },
      mode: MODE,
    },
    evaluate: (ctx, p, input) => {
      const cells: Cells = new Map()
      const v = ctx.hexValue(p.str('color'))
      const cx = p.num('cx')
      const cy = p.num('cy')
      const rx = p.num('rx')
      const ry = p.num('ry')
      for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(ctx.bh - 1, Math.ceil(cy + ry)); y++) {
        for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(ctx.bw - 1, Math.ceil(cx + rx)); x++) {
          const nx = (x + 0.5 - cx) / rx
          const ny = (y + 0.5 - cy) / ry
          if (nx * nx + ny * ny <= 1) cells.set(y * ctx.bw + x, v)
        }
      }
      return combineCells(input, cells, p.str('mode'))
    },
  }),
  defineNode({
    id: 'source.shape',
    kind: 'source',
    domain: { in: 'none', out: 'raster' },
    label: 'Shape',
    category: 'sources',
    tags: ['star', 'heart', 'gear', 'flower', 'moon', 'drop', 'lightning', 'zigzag', 'polygon', 'spiral', 'arrow', 'cross', 'sun', 'bento', 'ring', 'arc', 'chevron'],
    params: {
      shape: {
        kind: 'select',
        options: [
          'star', 'polygon', 'diamond', 'heart', 'spiral', 'arrow', 'lightning', 'moon',
          'wave', 'zigzag', 'cross', 'flower', 'gear', 'sun', 'bento', 'ring', 'arc',
          'drop', 'chevron', 'concentric', 'concentricRect',
        ] as const,
        default: 'star',
      },
      x: { kind: 'number', min: -1024, max: 3072, default: 3, span: 'x' },
      y: { kind: 'number', min: -1024, max: 3072, default: 3, span: 'y' },
      w: { kind: 'number', min: 3, max: 2048, default: 10, span: 'size' },
      h: { kind: 'number', min: 3, max: 2048, default: 10, span: 'size' },
      color: { kind: 'hex', default: '#e63946' },
      ...SHAPE_TOOL_PARAMS,
      mode: MODE,
    },
    evaluate: (ctx, p, input) => {
      const cells: Cells = new Map()
      const v = ctx.hexValue(p.str('color'))
      const x0 = p.num('x')
      const y0 = p.num('y')
      const x1 = x0 + p.num('w')
      const y1 = y0 + p.num('h')
      const outline = shapePathPoints(p.str('shape') as ShapeToolId, x0, y0, x1, y1, shapeOptsFrom(p))
      const outlineSet = new Set<number>()
      for (const [x, y] of outline) {
        if (x >= 0 && y >= 0 && x < ctx.bw && y < ctx.bh) outlineSet.add(y * ctx.bw + x)
      }
      const { inside } = regionCells(outlineSet, ctx.bw, ctx.bh)
      for (const i of outlineSet) cells.set(i, v)
      for (const i of inside) cells.set(i, v)
      return combineCells(input, cells, p.str('mode'))
    },
  }),
]
