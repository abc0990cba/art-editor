/**
 * Dither-era graph preset recipes (2026-10): showcase the halftone screen engine and the text
 * source. Coordinates are tuned for a 16×16 sample grid, like the core presets.
 */

import type { GraphPreset } from './presets.ts'
import type { GraphNode, ParamValue } from './types.ts'

/** Shorthand: one node with a position and partial params (same shape as the core presets). */
function n(
  id: string,
  op: string,
  pos: { x: number; y: number },
  params: Record<string, ParamValue> = {},
): GraphNode {
  return { id, op, params, pos }
}

/** Chain helper: wires every node into the next one. */
const chain = (ids: string[]): { from: string; to: string }[] =>
  ids.slice(0, -1).map((id, i) => ({ from: id, to: ids[i + 1] }))

export const DITHER_GRAPH_PRESETS: GraphPreset[] = [
  {
    id: 'halftone-print',
    label: 'Растр-печать',
    description: 'Эллипс с градиентом → mod.halftone: круглые точки по тону.',
    graph: {
      graphVersion: 1,
      nodes: [
        n(
          'n1',
          'source.ellipse',
          { x: 40, y: 60 },
          { cx: 8, cy: 8, rx: 5, ry: 4, color: '#e63946' },
        ),
        n('n2', 'ramp.gradient', { x: 300, y: 60 }, { angle: 90, from: 1, to: 3 }),
        n(
          'n3',
          'mod.halftone',
          { x: 560, y: 60 },
          { lattice: 'grid', mark: 'circle', mode: 'size', pitch: 2, color: '#262626' },
        ),
        n('n4', 'style.render', { x: 820, y: 60 }, { renderMode: 'pixels' }),
      ],
      edges: chain(['n1', 'n2', 'n3', 'n4']),
    },
  },
  {
    id: 'stipple-garden',
    label: 'Стипплинг-сад',
    description: 'Прямоугольник → mod.halftone: синий-шумовый scatter в режиме плотности.',
    graph: {
      graphVersion: 1,
      nodes: [
        n('n1', 'source.rect', { x: 40, y: 60 }, { x: 2, y: 2, w: 12, h: 12, color: '#2a9d8f' }),
        n(
          'n2',
          'mod.halftone',
          { x: 300, y: 60 },
          {
            lattice: 'scatter',
            mark: 'circle',
            mode: 'density',
            pitch: 2,
            color: '#1d3557',
            seed: 7,
          },
        ),
        n('n3', 'style.render', { x: 560, y: 60 }, { renderMode: 'pixels' }),
      ],
      edges: chain(['n1', 'n2', 'n3']),
    },
  },
  {
    id: 'engrave-rings',
    label: 'Гравюра кольцами',
    description: 'Эллипс → mod.halftone: капсулы по кольцам с закруткой по тону.',
    graph: {
      graphVersion: 1,
      nodes: [
        n(
          'n1',
          'source.ellipse',
          { x: 40, y: 60 },
          { cx: 8, cy: 8, rx: 6, ry: 4.5, color: '#e76f51' },
        ),
        n(
          'n2',
          'mod.halftone',
          { x: 300, y: 60 },
          {
            lattice: 'rings',
            mark: 'capsule',
            mode: 'twist',
            pitch: 3,
            twist: 270,
            color: '#3a0ca3',
          },
        ),
        n('n3', 'style.render', { x: 560, y: 60 }, { renderMode: 'pixels' }),
      ],
      edges: chain(['n1', 'n2', 'n3']),
    },
  },
  {
    id: 'type-stamp',
    label: 'Текстовая печать',
    description: 'source.text: надпись пиксельным шрифтом 5×7 со своим цветом.',
    graph: {
      graphVersion: 1,
      nodes: [
        n(
          'n1',
          'source.text',
          { x: 40, y: 60 },
          { text: 'DITHER', dx: 1, dy: 4, scale: 1, tracking: 1, color: '#262626' },
        ),
        n('n2', 'style.pixel', { x: 300, y: 60 }, {}),
      ],
      edges: chain(['n1', 'n2']),
    },
  },
  {
    id: 'type-halftone',
    label: 'Буквы растром',
    description: 'Крупная надпись → mod.halftone: звёзды на сотах по тону букв.',
    graph: {
      graphVersion: 1,
      nodes: [
        n(
          'n1',
          'source.text',
          { x: 40, y: 60 },
          { text: 'GO', dx: 1, dy: 2, scale: 4, tracking: 2, color: '#111111' },
        ),
        n(
          'n2',
          'mod.halftone',
          { x: 300, y: 60 },
          { lattice: 'hex', mark: 'star', mode: 'size', pitch: 3, color: '#7209b7' },
        ),
        n('n3', 'style.render', { x: 560, y: 60 }, { renderMode: 'pixels' }),
      ],
      edges: chain(['n1', 'n2', 'n3']),
    },
  },
  {
    id: 'duotone-sun',
    label: 'Дуотон-солнце',
    description: 'Круг с радиальным градиентом → mod.halftone: сердечки с закруткой.',
    graph: {
      graphVersion: 1,
      nodes: [
        n(
          'n1',
          'source.ellipse',
          { x: 40, y: 60 },
          { cx: 8, cy: 8, rx: 6, ry: 6, color: '#f4a261' },
        ),
        n('n2', 'ramp.gradient', { x: 300, y: 60 }, { angle: 0, from: 3, to: 1 }),
        n(
          'n3',
          'mod.halftone',
          { x: 560, y: 60 },
          { lattice: 'grid', mark: 'heart', mode: 'twist', pitch: 3, twist: 360, color: '#d62828' },
        ),
        n('n4', 'style.render', { x: 820, y: 60 }, { renderMode: 'pixels' }),
      ],
      edges: chain(['n1', 'n2', 'n3', 'n4']),
    },
  },
]
