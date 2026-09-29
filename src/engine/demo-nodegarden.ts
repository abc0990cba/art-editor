/**
 * Demo «Сад нод» — a 128×128 night garden where every flower is grown by a node graph instead of
 * painted cells: a daisy from a circular array with a gradient rinse, a dandelion clock from two
 * dot rings, a metaball bush and a crown tulip. Shows the per-object node editor end to end —
 * sources, arrays, ramps, metaballs and style nodes — over a hand-painted ground.
 */

import { makeGrid, makeLayer, makeObj, paint, sceneHead } from './demo-kit.ts'
import type { InkGrid } from './demo-kit.ts'
import type { Graph, GraphNode, ParamValue } from './nodes/types.ts'
import type { ProjectJSON } from './project.ts'

export const GARDEN_COLS = 128
export const GARDEN_ROWS = 128

const PALETTE = [
  '#101f1a',
  '#f72585',
  '#ffd166',
  '#4cc9f0',
  '#06d6a0',
  '#b5179e',
  '#fff7ed',
  '#2d6a4f',
] as const
const V = { magenta: 2, gold: 3, cyan: 4, green: 5, cream: 7, soil: 8 }

/** One node with an editor position; params stay in canvas cells (the garden is 128 wide). */
const n = (
  id: string,
  op: string,
  x: number,
  y: number,
  params: Record<string, ParamValue> = {},
): GraphNode => ({ id, op, params, pos: { x, y } })

/** Wire every node into the next one — the graph's raster flow. */
const chain = (nodes: GraphNode[]): Graph => ({
  graphVersion: 1,
  nodes,
  edges: nodes.slice(0, -1).map((node, i) => ({ from: node.id, to: nodes[i + 1].id })),
})

/** A daisy: one petal ellipse × 6 around the stem top, gradient-rinsed magenta→gold. */
function daisyGraph(): Graph {
  return chain([
    n('p', 'source.ellipse', 40, 40, { cx: 30, cy: 75, rx: 4.5, ry: 8, color: '#f72585' }),
    n('a', 'mod.arrayCircle', 280, 40, { count: 6, cx: 30, cy: 86 }),
    n('g', 'ramp.gradient', 520, 40, { angle: 90, from: V.magenta, to: V.gold }),
    n('c', 'source.ellipse', 760, 40, { cx: 30, cy: 86, rx: 5, ry: 5, color: '#fff7ed' }),
    n('s', 'style.pixel', 1000, 40, { radius: 0.4, sizeX: 1, sizeY: 1 }),
  ])
}

/** A dandelion clock: two rings of seed dots around an off-center stem top. */
function puffGraph(): Graph {
  return chain([
    n('d1', 'source.ellipse', 40, 40, { cx: 64, cy: 42, rx: 1.6, ry: 1.6, color: '#4cc9f0' }),
    n('a1', 'mod.arrayCircle', 280, 40, { count: 12, cx: 64, cy: 50 }),
    n('d2', 'source.ellipse', 520, 40, {
      cx: 64,
      cy: 45,
      rx: 1.2,
      ry: 1.2,
      color: '#fff7ed',
      mode: 'add',
    }),
    n('a2', 'mod.arrayCircle', 760, 40, { count: 8, cx: 64, cy: 50 }),
    n('s', 'style.pixel', 1000, 40, { radius: 0.5, sizeX: 1, sizeY: 1 }),
  ])
}

/** A bush: three overlapping ellipses fused into one blobby silhouette. */
function bushGraph(): Graph {
  return chain([
    n('b1', 'source.ellipse', 40, 40, { cx: 104, cy: 94, rx: 10, ry: 8, color: '#06d6a0' }),
    n('b2', 'source.ellipse', 280, 40, {
      cx: 114,
      cy: 90,
      rx: 8,
      ry: 7,
      color: '#06d6a0',
      mode: 'add',
    }),
    n('b3', 'source.ellipse', 520, 40, {
      cx: 119,
      cy: 97,
      rx: 7,
      ry: 6,
      color: '#06d6a0',
      mode: 'add',
    }),
    n('m', 'style.metaball', 760, 40, { strength: 70, perColor: true }),
    n('r', 'style.render', 1000, 40, { renderMode: 'metaball', connectivity: 'edge' }),
  ])
}

/** A crown tulip: the procedural crown blooming gold→violet on a painted stem. */
function crownGraph(): Graph {
  return chain([
    n('c', 'source.crown', 60, 30, {
      x: 68,
      y: 82,
      w: 24,
      h: 18,
      spikes: 5,
      spikeShape: 'rounded',
      spikeHeight: 0.62,
      spikeWidth: 0.8,
      jaggedness: 0.12,
      asymmetry: 0,
      bandHeight: 0.2,
      jewels: 5,
      jewelSize: 0.1,
      seed: 7,
      color: '#ffd166',
    }),
    n('g', 'ramp.gradient', 420, 30, { angle: 90, from: V.gold, to: 6 }),
    n('s', 'style.pixel', 760, 30, { radius: 0.15, sizeX: 1, sizeY: 1 }),
  ])
}

/** Hand-painted ground: soil band, grass lip and stems for the three grown flowers. */
function paintGround(g: InkGrid): void {
  for (let x = 0; x < GARDEN_COLS; x++) {
    paint(g, x, GARDEN_ROWS - 16, V.green)
    for (let y = GARDEN_ROWS - 15; y < GARDEN_ROWS; y++) paint(g, x, y, V.soil)
  }
  for (let y = 106; y < GARDEN_ROWS - 15; y++) paint(g, 30, y, V.soil)
  for (let y = 54; y < GARDEN_ROWS - 15; y++) paint(g, 64, y, V.soil)
  for (let y = 100; y < GARDEN_ROWS - 15; y++) paint(g, 80, y, V.soil)
  for (let y = 104; y < GARDEN_ROWS - 15; y++)
    for (let x = 106; x < 111; x++) paint(g, x, y, V.soil)
  paint(g, 28, 108, V.green)
  paint(g, 32, 108, V.green)
  paint(g, 28, 111, V.green)
  paint(g, 32, 111, V.green)
}

/** The node garden as a fresh v3 scene document; deterministic down to the last node. */
export function nodeGardenProjectJSON(): ProjectJSON {
  const ground = makeGrid(GARDEN_COLS, GARDEN_ROWS)
  paintGround(ground)
  const empty = (): InkGrid => makeGrid(GARDEN_COLS, GARDEN_ROWS)

  let id = 0
  const nextId = () => ++id
  return {
    ...sceneHead(GARDEN_COLS, GARDEN_ROWS, PALETTE),
    bg: '#101f1a',
    layers: [
      makeLayer(nextId(), 'Сад', [
        makeObj(nextId(), 'Земля', ground),
        makeObj(nextId(), 'Ромашка', empty(), { graph: daisyGraph() }),
        makeObj(nextId(), 'Одуванчик', empty(), { graph: puffGraph() }),
        makeObj(nextId(), 'Куст', empty(), { graph: bushGraph() }),
        makeObj(nextId(), 'Тюльпан-корона', empty(), { graph: crownGraph() }),
      ]),
    ],
    nextNodeId: id + 1,
    fuseObjects: true,
  }
}
