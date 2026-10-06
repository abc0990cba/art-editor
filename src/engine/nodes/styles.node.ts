/** Style nodes: write the object's appearance parameters (no raster input). */

import { CELL_SHAPE_IDS, isCellShapeId, normalizeShapeParams } from '../cell-shapes/index.ts'
import {
  FIELD_ALIGN_KINDS,
  FIELD_OFFSET_KINDS,
  FIELD_SIZE_KINDS,
  normalizeField,
} from '../core/field.ts'
import { INLAY_COLOR_MODES, normalizeInlay } from '../core/inlay.ts'
import { normalizeStroke } from '../core/stroke.ts'
import { defineNode } from './types.ts'

export const STYLE_NODES = [
  defineNode({
    id: 'style.pixel',
    kind: 'style',
    domain: { in: 'style', out: 'style' },
    label: 'Pixel shape',
    category: 'style',
    tags: ['radius', 'rounding', 'corner', 'size', 'shape', 'form', 'tone', 'inlay', 'inner'],
    params: {
      radius: { kind: 'number', min: 0, max: 0.5, step: 0.01, default: 0.3 },
      sizeX: { kind: 'number', min: 0.05, max: 1, step: 0.05, default: 1 },
      sizeY: { kind: 'number', min: 0.05, max: 1, step: 0.05, default: 1 },
      shape: { kind: 'select', options: CELL_SHAPE_IDS, default: 'square' },
      thickness: { kind: 'number', min: 0.05, max: 0.5, step: 0.01, default: 0.25 },
      points: { kind: 'int', min: 3, max: 12, default: 5 },
      rotation: { kind: 'number', min: 0, max: 359, step: 1, default: 0 },
      toneSize: { kind: 'bool', default: false },
      toneSizeMin: { kind: 'number', min: 0.05, max: 1, step: 0.01, default: 0.2 },
      inlayShape: {
        kind: 'select',
        options: ['none', ...CELL_SHAPE_IDS] as const,
        default: 'none',
      },
      inlayScale: { kind: 'number', min: 0.1, max: 0.9, step: 0.01, default: 0.45 },
      inlayOffsetX: { kind: 'number', min: -0.5, max: 0.5, step: 0.01, default: 0 },
      inlayOffsetY: { kind: 'number', min: -0.5, max: 0.5, step: 0.01, default: 0 },
      inlayRotation: { kind: 'number', min: 0, max: 359, step: 1, default: 0 },
      inlaySource: { kind: 'select', options: ['shape', 'glyph'] as const, default: 'shape' },
      inlayGlyph: { kind: 'string', default: '😀' },
      inlayResolution: { kind: 'int', min: 4, max: 12, default: 8 },
      strokeWidth: { kind: 'number', min: 0, max: 0.45, step: 0.01, default: 0 },
      strokeMode: {
        kind: 'select',
        options: ['same', 'darken', 'lighten'] as const,
        default: 'same',
      },
      strokeFill: { kind: 'bool', default: true },
      inlayColorMode: { kind: 'select', options: INLAY_COLOR_MODES, default: 'darken' },
      inlaySlot: { kind: 'int', min: 1, max: 999, default: 1 },
      inlayDepth: { kind: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
    },
    evaluate: (_ctx, p, style) => {
      style.style.radius = p.num('radius')
      style.style.sizeX = p.num('sizeX')
      style.style.sizeY = p.num('sizeY')
      const shape = p.str('shape')
      if (isCellShapeId(shape)) style.style.shape = shape
      style.style.shapeParams = normalizeShapeParams({
        thickness: p.num('thickness'),
        points: p.int('points'),
        rotation: p.num('rotation'),
      })
      style.style.toneSize = p.bool('toneSize')
      style.style.toneSizeMin = p.num('toneSizeMin')
      style.style.inlay = normalizeInlay({
        source: p.str('inlaySource'),
        glyph: p.str('inlayGlyph'),
        resolution: p.int('inlayResolution'),
        shape: p.str('inlayShape'),
        scale: p.num('inlayScale'),
        offsetX: p.num('inlayOffsetX'),
        offsetY: p.num('inlayOffsetY'),
        rotation: p.num('inlayRotation'),
        colorMode: p.str('inlayColorMode'),
        slot: p.int('inlaySlot'),
        depth: p.num('inlayDepth'),
      })
      style.style.stroke = normalizeStroke({
        width: p.num('strokeWidth'),
        colorMode: p.str('strokeMode'),
        fill: p.bool('strokeFill'),
      })
    },
  }),
  defineNode({
    id: 'style.render',
    kind: 'style',
    domain: { in: 'style', out: 'style' },
    label: 'Render mode',
    category: 'style',
    tags: ['pixels', 'outline', 'metaball', 'contour', 'extrude', 'mode'],
    params: {
      renderMode: {
        kind: 'select',
        options: ['pixels', 'outline', 'metaball', 'contour', 'extrude'] as const,
        default: 'metaball',
      },
      connectivity: {
        kind: 'select',
        options: ['edge', 'corner', 'corner-bridge'] as const,
        default: 'edge',
      },
    },
    evaluate: (_ctx, p, style) => {
      style.renderMode = p.str('renderMode') as typeof style.renderMode
      style.connectivity = p.str('connectivity') as typeof style.connectivity
    },
  }),
  defineNode({
    id: 'style.metaball',
    kind: 'style',
    domain: { in: 'style', out: 'style' },
    label: 'Metaball',
    category: 'style',
    tags: ['metaball', 'blob', 'merge', 'strength'],
    params: {
      strength: { kind: 'number', min: 0, max: 100, default: 45 },
      perColor: { kind: 'bool', default: true },
    },
    evaluate: (_ctx, p, style) => {
      style.metaball.strength = p.num('strength')
      style.metaball.perColor = p.bool('perColor')
    },
  }),
  defineNode({
    id: 'style.texture',
    kind: 'style',
    domain: { in: 'style', out: 'style' },
    label: 'Texture',
    category: 'style',
    tags: ['grain', 'grunge', 'halftone', 'hatch', 'texture', 'seed'],
    params: {
      effect: {
        kind: 'select',
        options: ['none', 'grain', 'grunge', 'halftone', 'hatch'] as const,
        default: 'grain',
      },
      amount: { kind: 'number', min: 0, max: 100, default: 40 },
      scale: { kind: 'number', min: 0.1, max: 8, step: 0.1, default: 1 },
      angle: { kind: 'number', min: 0, max: 180, default: 45 },
      seed: { kind: 'int', min: 0, max: 9999, default: 1 },
    },
    evaluate: (_ctx, p, style) => {
      style.texture.effect = p.str('effect') as typeof style.texture.effect
      style.texture.amount = p.num('amount')
      style.texture.scale = p.num('scale')
      style.texture.angle = p.num('angle')
      style.texture.seed = p.int('seed')
    },
  }),
  defineNode({
    id: 'style.field',
    kind: 'style',
    domain: { in: 'style', out: 'style' },
    label: 'Field',
    category: 'style',
    tags: ['field', 'funnel', 'vortex', 'wave', 'rings', 'truchet', 'scatter', 'spiral'],
    params: {
      size: { kind: 'select', options: FIELD_SIZE_KINDS, default: 'funnel' },
      align: { kind: 'select', options: FIELD_ALIGN_KINDS, default: 'none' },
      offset: { kind: 'select', options: FIELD_OFFSET_KINDS, default: 'none' },
      amount: { kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
      min: { kind: 'number', min: 0.05, max: 1, step: 0.01, default: 0.1 },
      angle: { kind: 'number', min: 0, max: 359, step: 1, default: 0 },
      period: { kind: 'int', min: 2, max: 64, default: 8 },
      phase: { kind: 'number', min: 0, max: 359, step: 1, default: 0 },
      seed: { kind: 'int', min: 1, max: 9999, default: 1 },
      invert: { kind: 'bool', default: false },
    },
    evaluate: (_ctx, p, style) => {
      style.style.field = normalizeField({
        size: p.str('size'),
        align: p.str('align'),
        offset: p.str('offset'),
        amount: p.num('amount'),
        min: p.num('min'),
        angle: p.num('angle'),
        period: p.int('period'),
        phase: p.num('phase'),
        seed: p.int('seed'),
        invert: p.bool('invert'),
      })
    },
  }),
]
