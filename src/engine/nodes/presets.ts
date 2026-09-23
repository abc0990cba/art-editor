/**
 * Example graph presets: ready-made node recipes that demonstrate the node system in
 * practice — arrays, mirroring, boolean subtract/intersect, ramps, styles. Preset
 * coordinates are tuned for a 16×16 sample grid; `fitGraphToCanvas` rescales them to
 * the current canvas at apply time.
 */

import type { Graph, GraphNode, ParamValue } from './types'

export interface GraphPreset {
  id: string
  label: string
  description: string
  graph: Graph
}

/** Shorthand: one node with a position and partial params. */
function n(
  id: string,
  op: string,
  pos: { x: number; y: number },
  params: Record<string, ParamValue> = {},
): GraphNode {
  return { id, op, params, pos }
}

/** Chain helper: wires every node into the next one. */
const chain = (ids: string[]): Array<{ from: string; to: string }> =>
  ids.slice(0, -1).map((id, i) => ({ from: id, to: ids[i + 1] }))

/** Param keys that carry canvas coordinates and must scale with the canvas. */
const SCALE_KEYS = new Set(['x', 'y', 'w', 'h', 'cx', 'cy', 'rx', 'ry', 'dx', 'dy'])

/**
 * Rescale a preset graph (tuned for 16×16) to the current canvas: positional cell
 * params multiply by min(bufferW, bufferH) / 16, everything else — including node card
 * positions, which live in editor pixels — passes through untouched.
 */
export function fitGraphToCanvas(graph: Graph, bw: number, bh: number): Graph {
  const scale = Math.min(bw, bh) / 16
  const mapParam = (key: string, value: ParamValue): ParamValue => {
    if (!SCALE_KEYS.has(key) || typeof value !== 'number') return value
    const scaled = Math.round(value * scale)
    // sizes and offsets must not collapse to zero on tiny canvases
    return value > 0 ? Math.max(1, scaled) : scaled
  }
  const walk = (nodes: GraphNode[]): GraphNode[] =>
    nodes.map((node) => {
      const params: Record<string, ParamValue> = {}
      for (const [k, v] of Object.entries(node.params)) params[k] = mapParam(k, v)
      return { ...node, params }
    })
  return { graphVersion: graph.graphVersion, nodes: walk(graph.nodes), ...(graph.edges ? { edges: graph.edges } : {}) }
}

export const GRAPH_PRESETS: GraphPreset[] = [
  {
    id: 'flower-circle-array',
    label: 'Цветок — круговой массив',
    description: 'Эллипс × 6 копий по окружности + градиент + metaball.',
    graph: {
      graphVersion: 1,
      nodes: [
        n('n1', 'source.ellipse', { x: 40, y: 40 }, { cx: 8, cy: 5, rx: 2, ry: 3.5, color: '#e63946' }),
        n('n2', 'mod.arrayCircle', { x: 280, y: 40 }, { count: 6, cx: 8, cy: 8 }),
        n('n3', 'ramp.gradient', { x: 520, y: 40 }, { angle: 45, from: 1, to: 3 }),
        n('n4', 'style.render', { x: 760, y: 40 }, { renderMode: 'metaball', connectivity: 'edge' }),
      ],
      edges: chain(['n1', 'n2', 'n3', 'n4']),
    },
  },
  {
    id: 'mirror-quad-corners',
    label: 'Узор — зеркало ×4',
    description: 'Один прямоугольник в углу и зеркалирование по четырём углам.',
    graph: {
      graphVersion: 1,
      nodes: [
        n('n1', 'source.rect', { x: 40, y: 40 }, { x: 2, y: 2, w: 4, h: 4, color: '#2a9d8f' }),
        n('n2', 'mod.symmetry', { x: 280, y: 40 }, { mode: 'quad', n: 8 }),
        n('n3', 'style.pixel', { x: 520, y: 40 }, { radius: 0.4, sizeX: 1, sizeY: 1 }),
      ],
      edges: chain(['n1', 'n2', 'n3']),
    },
  },
  {
    id: 'snowflake-diag8',
    label: 'Снежинка — diag8 + зерно',
    description: 'Полоска, отражённая 8 направлениями, с зернистой текстурой.',
    graph: {
      graphVersion: 1,
      nodes: [
        n('n1', 'source.ellipse', { x: 40, y: 40 }, { cx: 5, cy: 8, rx: 4, ry: 1, color: '#4cc9f0' }),
        n('n2', 'mod.symmetry', { x: 280, y: 40 }, { mode: 'diag8', n: 8 }),
        n('n3', 'style.texture', { x: 520, y: 40 }, { effect: 'grain', amount: 50, scale: 1, angle: 45, seed: 7 }),
      ],
      edges: chain(['n1', 'n2', 'n3']),
    },
  },
  {
    id: 'stripes-linear-array',
    label: 'Полосы — линейный массив',
    description: 'Узкий прямоугольник × 5 со сдвигом и вертикальным градиентом.',
    graph: {
      graphVersion: 1,
      nodes: [
        n('n1', 'source.rect', { x: 40, y: 40 }, { x: 1, y: 2, w: 2, h: 12, color: '#e9c46a' }),
        n('n2', 'mod.arrayGrid', { x: 280, y: 40 }, { count: 5, dx: 3, dy: 0 }),
        n('n3', 'ramp.gradient', { x: 520, y: 40 }, { angle: 90, from: 1, to: 3 }),
        n('n4', 'style.pixel', { x: 760, y: 40 }, { radius: 0.15, sizeX: 1, sizeY: 1 }),
      ],
      edges: chain(['n1', 'n2', 'n3', 'n4']),
    },
  },
  {
    id: 'lattice-double-array',
    label: 'Решётка — массив ×2',
    description: 'Два chained-массива строят сетку: сначала по строке, потом по столбцу.',
    graph: {
      graphVersion: 1,
      nodes: [
        n('n1', 'source.rect', { x: 40, y: 40 }, { x: 1, y: 1, w: 2, h: 2, color: '#7209b7' }),
        n('n2', 'mod.arrayGrid', { x: 280, y: 40 }, { count: 4, dx: 4, dy: 0 }),
        n('n3', 'mod.arrayGrid', { x: 520, y: 40 }, { count: 4, dx: 0, dy: 4 }),
        n('n4', 'style.pixel', { x: 760, y: 40 }, { radius: 0.5, sizeX: 1, sizeY: 1 }),
      ],
      edges: chain(['n1', 'n2', 'n3', 'n4']),
    },
  },
  {
    id: 'ring-subtract',
    label: 'Кольцо — вычитание',
    description: 'Из большого круга вычитается меньший; сверху — полутоновая текстура.',
    graph: {
      graphVersion: 1,
      nodes: [
        n('n1', 'source.ellipse', { x: 40, y: 40 }, { cx: 8, cy: 8, rx: 6, ry: 6, color: '#e63946' }),
        n('n2', 'source.ellipse', { x: 280, y: 40 }, { cx: 8, cy: 8, rx: 3, ry: 3, color: '#2a9d8f', mode: 'subtract' }),
        n('n3', 'style.texture', { x: 520, y: 40 }, { effect: 'halftone', amount: 60, scale: 1.2, angle: 45, seed: 3 }),
      ],
      edges: chain(['n1', 'n2', 'n3']),
    },
  },
  {
    id: 'moon-subtract-offset',
    label: 'Полумесяц — вычитание со сдвигом',
    description: 'Два круга со сдвигом: второй вырезает из первого.',
    graph: {
      graphVersion: 1,
      nodes: [
        n('n1', 'source.ellipse', { x: 40, y: 40 }, { cx: 7, cy: 8, rx: 5, ry: 5, color: '#e9c46a' }),
        n('n2', 'source.ellipse', { x: 280, y: 40 }, { cx: 10, cy: 7, rx: 4.5, ry: 4.5, color: '#e63946', mode: 'subtract' }),
        n('n3', 'style.pixel', { x: 520, y: 40 }, { radius: 0.2, sizeX: 1, sizeY: 1 }),
      ],
      edges: chain(['n1', 'n2', 'n3']),
    },
  },
  {
    id: 'lens-intersect',
    label: 'Линза — пересечение',
    description: 'Два круга пересекаются: остаётся только линза, покрашенная градиентом.',
    graph: {
      graphVersion: 1,
      nodes: [
        n('n1', 'source.ellipse', { x: 40, y: 40 }, { cx: 6, cy: 8, rx: 4, ry: 4, color: '#4361ee' }),
        n('n2', 'source.ellipse', { x: 280, y: 40 }, { cx: 10, cy: 8, rx: 4, ry: 4, color: '#4361ee', mode: 'intersect' }),
        n('n3', 'ramp.gradient', { x: 520, y: 40 }, { angle: 0, from: 2, to: 1 }),
      ],
      edges: chain(['n1', 'n2', 'n3']),
    },
  },
  {
    id: 'gradient-dots-circle',
    label: 'Точки по кругу + градиент',
    description: '12 мелких кругов по окружности, перекрашенных по высоте.',
    graph: {
      graphVersion: 1,
      nodes: [
        n('n1', 'source.ellipse', { x: 40, y: 40 }, { cx: 8, cy: 8, rx: 1, ry: 1, color: '#7209b7' }),
        n('n2', 'mod.arrayCircle', { x: 280, y: 40 }, { count: 12, cx: 8, cy: 8 }),
        n('n3', 'ramp.gradient', { x: 520, y: 40 }, { angle: 90, from: 1, to: 2 }),
        n('n4', 'style.pixel', { x: 760, y: 40 }, { radius: 0.5, sizeX: 1, sizeY: 1 }),
      ],
      edges: chain(['n1', 'n2', 'n3', 'n4']),
    },
  },
  {
    id: 'swiss-cheese-subtract',
    label: 'Сыр — три вырезания',
    description: 'Прямоугольник, из которого последовательно вырезаны три круга.',
    graph: {
      graphVersion: 1,
      nodes: [
        n('n1', 'source.rect', { x: 40, y: 40 }, { x: 1, y: 1, w: 14, h: 14, color: '#e9c46a' }),
        n('n2', 'source.ellipse', { x: 280, y: 40 }, { cx: 5, cy: 5, rx: 1.5, ry: 1.5, color: '#e63946', mode: 'subtract' }),
        n('n3', 'source.ellipse', { x: 520, y: 40 }, { cx: 11, cy: 8, rx: 2, ry: 2, color: '#e63946', mode: 'subtract' }),
        n('n4', 'source.ellipse', { x: 760, y: 40 }, { cx: 6, cy: 12, rx: 1.2, ry: 1.2, color: '#e63946', mode: 'subtract' }),
        n('n5', 'style.texture', { x: 1000, y: 40 }, { effect: 'grunge', amount: 50, scale: 1, angle: 0, seed: 5 }),
      ],
      edges: chain(['n1', 'n2', 'n3', 'n4', 'n5']),
    },
  },
  {
    id: 'metaball-blobs',
    label: 'Метаболл-капли',
    description: 'Три круга, которые сливаются в блобы при высокой силе metaball.',
    graph: {
      graphVersion: 1,
      nodes: [
        n('n1', 'source.ellipse', { x: 40, y: 40 }, { cx: 6, cy: 6, rx: 2.5, ry: 2.5, color: '#4361ee' }),
        n('n2', 'source.ellipse', { x: 280, y: 40 }, { cx: 10, cy: 9, rx: 2.5, ry: 2.5, color: '#4361ee', mode: 'add' }),
        n('n3', 'source.ellipse', { x: 520, y: 40 }, { cx: 9, cy: 12, rx: 2, ry: 2, color: '#4361ee', mode: 'add' }),
        n('n4', 'style.metaball', { x: 760, y: 40 }, { strength: 75, perColor: true }),
        n('n5', 'style.render', { x: 1000, y: 40 }, { renderMode: 'metaball', connectivity: 'edge' }),
      ],
      edges: chain(['n1', 'n2', 'n3', 'n4', 'n5']),
    },
  },
  {
    id: 'star-grain-outline',
    label: 'Звезда с зерном — контур',
    description: 'Шестилучевая звезда: контурный режим + зернистая текстура.',
    graph: {
      graphVersion: 1,
      nodes: [
        n('n1', 'source.shape', { x: 40, y: 40 }, { shape: 'star', x: 2, y: 2, w: 12, h: 12, rays: 6, inner: 0.45, color: '#f72585' }),
        n('n2', 'style.render', { x: 280, y: 40 }, { renderMode: 'outline', connectivity: 'edge' }),
        n('n3', 'style.texture', { x: 520, y: 40 }, { effect: 'grain', amount: 70, scale: 1, angle: 45, seed: 12 }),
      ],
      edges: chain(['n1', 'n2', 'n3']),
    },
  },
  {
    id: 'metaball-merge-infinity',
    label: 'Слияние метаболлов',
    description: 'Три круга тянутся друг к другу: нода Metaball со силой 90.',
    graph: {
      graphVersion: 1,
      nodes: [
        n('n1', 'source.ellipse', { x: 40, y: 40 }, { cx: 4, cy: 8, rx: 3, ry: 3, color: '#4cc9f0' }),
        n('n2', 'source.ellipse', { x: 280, y: 40 }, { cx: 9, cy: 7, rx: 2.6, ry: 2.6, color: '#4cc9f0', mode: 'add' }),
        n('n3', 'source.ellipse', { x: 520, y: 40 }, { cx: 13, cy: 9, rx: 2.2, ry: 2.2, color: '#4cc9f0', mode: 'add' }),
        n('n4', 'style.metaball', { x: 760, y: 40 }, { strength: 90, perColor: false }),
        n('n5', 'style.render', { x: 1000, y: 40 }, { renderMode: 'metaball', connectivity: 'edge' }),
      ],
      edges: chain(['n1', 'n2', 'n3', 'n4', 'n5']),
    },
  },
  {
    id: 'bullseye',
    label: 'Мишень — кольцо + ядро',
    description: 'Концентрические круги: добавили, вычли, добавили заново.',
    graph: {
      graphVersion: 1,
      nodes: [
        n('n1', 'source.ellipse', { x: 40, y: 40 }, { cx: 8, cy: 8, rx: 6, ry: 6, color: '#e63946' }),
        n('n2', 'source.ellipse', { x: 280, y: 40 }, { cx: 8, cy: 8, rx: 4, ry: 4, color: '#2a9d8f', mode: 'subtract' }),
        n('n3', 'source.ellipse', { x: 520, y: 40 }, { cx: 8, cy: 8, rx: 2, ry: 2, color: '#2a9d8f', mode: 'add' }),
        n('n4', 'style.pixel', { x: 760, y: 40 }, { radius: 0.5, sizeX: 1, sizeY: 1 }),
      ],
      edges: chain(['n1', 'n2', 'n3', 'n4']),
    },
  },
  {
    id: 'petals-mirror',
    label: 'Лепестки — массив + зеркало',
    description: 'Круговой массив лепестков, отражённый зеркалом по вертикали.',
    graph: {
      graphVersion: 1,
      nodes: [
        n('n1', 'source.ellipse', { x: 40, y: 40 }, { cx: 8, cy: 4.5, rx: 2.5, ry: 2.5, color: '#f72585' }),
        n('n2', 'mod.arrayCircle', { x: 280, y: 40 }, { count: 5, cx: 8, cy: 8 }),
        n('n3', 'mod.symmetry', { x: 520, y: 40 }, { mode: 'mirrorY', n: 8 }),
        n('n4', 'style.render', { x: 760, y: 40 }, { renderMode: 'outline', connectivity: 'corner' }),
      ],
      edges: chain(['n1', 'n2', 'n3', 'n4']),
    },
  },
  {
    id: 'checker-dots',
    label: 'Шахматка — точки',
    description: 'Точка × линейный массив × второй массив: сетка 4×4 с шагом 2.',
    graph: {
      graphVersion: 1,
      nodes: [
        n('n1', 'source.rect', { x: 40, y: 40 }, { x: 1, y: 1, w: 1, h: 1, color: '#4361ee' }),
        n('n2', 'mod.arrayGrid', { x: 280, y: 40 }, { count: 4, dx: 2, dy: 0 }),
        n('n3', 'mod.arrayGrid', { x: 520, y: 40 }, { count: 4, dx: 0, dy: 2 }),
        n('n4', 'style.pixel', { x: 760, y: 40 }, { radius: 0.15, sizeX: 1, sizeY: 1 }),
      ],
      edges: chain(['n1', 'n2', 'n3', 'n4']),
    },
  },
  {
    id: 'star-in-circle',
    label: 'Звезда в круге — пересечение',
    description: 'Звезда, обрезанная кругом: mode intersect + скруглённый пиксель.',
    graph: {
      graphVersion: 1,
      nodes: [
        n('n1', 'source.shape', { x: 40, y: 40 }, { shape: 'star', x: 2, y: 2, w: 12, h: 12, rays: 5, inner: 0.42, color: '#4361ee' }),
        n('n2', 'source.ellipse', { x: 280, y: 40 }, { cx: 8, cy: 8, rx: 5.5, ry: 5.5, color: '#4361ee', mode: 'intersect' }),
        n('n3', 'style.pixel', { x: 520, y: 40 }, { radius: 0.3, sizeX: 1, sizeY: 1 }),
      ],
      edges: chain(['n1', 'n2', 'n3']),
    },
  },
  {
    id: 'gear-gradient-grain',
    label: 'Шестерёнка — градиент + зерно',
    description: 'Шестерёнка с диагональным градиентом и зернистой текстурой.',
    graph: {
      graphVersion: 1,
      nodes: [
        n('n1', 'source.shape', { x: 40, y: 40 }, { shape: 'gear', x: 3, y: 3, w: 11, h: 11, color: '#e9c46a' }),
        n('n2', 'ramp.gradient', { x: 280, y: 40 }, { angle: 135, from: 1, to: 3 }),
        n('n3', 'style.texture', { x: 520, y: 40 }, { effect: 'grain', amount: 60, scale: 1.4, angle: 30, seed: 11 }),
        n('n4', 'style.pixel', { x: 760, y: 40 }, { radius: 0.1, sizeX: 1, sizeY: 1 }),
      ],
      edges: chain(['n1', 'n2', 'n3', 'n4']),
    },
  },
]
