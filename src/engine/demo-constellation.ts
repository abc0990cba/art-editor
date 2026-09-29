/**
 * Demo «Созвездия» — a 128×96 winter sky chart: every painted cell renders as a four-point sparkle,
 * dim background stars dust a milky-way band, and three constellations are drawn with their figures
 * joined by connectors. Shows the sparkle cell form, the connector tool (`obj.links` +
 * `connectorWidth`) and a document background color.
 */

import { hash01, makeGrid, makeLayer, makeObj, paint, sceneHead, stylePatch } from './demo-kit.ts'
import type { InkGrid, Link } from './demo-kit.ts'
import type { ProjectJSON } from './project.ts'

export const SKY_COLS = 128
export const SKY_ROWS = 96

const PALETTE = ['#0b1026', '#8ea2e8', '#1c2a54', '#a5b4fc', '#fff7ed', '#e0e7ff'] as const
const V = { dim: 2, dust: 3, line: 4, bright: 5, glow: 6 }

/** [x, y] star positions for each figure, in sky coordinates. */
const FIGURES: { name: string; stars: [number, number][] }[] = [
  {
    name: 'Большая Медведица',
    stars: [
      [16, 22],
      [28, 16],
      [42, 18],
      [54, 26],
      [56, 40],
      [70, 44],
      [82, 36],
    ],
  },
  {
    name: 'Кассиопея',
    stars: [
      [88, 58],
      [98, 66],
      [108, 56],
      [118, 64],
      [126, 54],
    ],
  },
  {
    name: 'Лебедь',
    stars: [
      [30, 62],
      [38, 70],
      [46, 80],
      [22, 74],
      [54, 66],
    ],
  },
]

/** Dim star dust and the diagonal milky-way band on the background object. */
function paintStarDust(g: InkGrid): void {
  for (let y = 0; y < SKY_ROWS; y++) {
    for (let x = 0; x < SKY_COLS; x++) {
      const band = Math.abs(y - (0.35 * x + 26 + Math.sin(x * 0.11) * 5)) < 8
      if (band && hash01(x * 3 + 1, y) < 0.2) paint(g, x, y, V.dust)
      else if (hash01(x, y * 7 + 3) < 0.028) paint(g, x, y, V.dim)
    }
  }
}

/** One constellation object: bright sparkle stars, halo cells and the figure's links. */
function makeFigure(id: number, fig: (typeof FIGURES)[number]): ReturnType<typeof makeObj> {
  const g = makeGrid(SKY_COLS, SKY_ROWS)
  const links: Link[] = []
  fig.stars.forEach(([x, y], k) => {
    paint(g, x, y, V.bright)
    paint(g, x + 1, y, V.glow)
    paint(g, x, y + 1, V.glow)
    if (k > 0) {
      const [ax, ay] = fig.stars[k - 1]
      links.push({ ax, ay, bx: x, by: y, v: V.line })
    }
  })
  return makeObj(id, fig.name, g, { links })
}

/** Two shooting stars streaking across a corner of the sky. */
function paintMeteors(g: InkGrid): void {
  for (let k = 0; k < 4; k++) {
    paint(g, 98 + k * 2, 10 + k * 2, k < 2 ? V.glow : V.dim)
    paint(g, 12 + k, 30 - k, k < 2 ? V.glow : V.dim)
  }
}

/** The sky chart as a fresh v3 scene document; deterministic down to the last cell. */
export function constellationProjectJSON(): ProjectJSON {
  const dust = makeGrid(SKY_COLS, SKY_ROWS)
  paintStarDust(dust)
  const meteors = makeGrid(SKY_COLS, SKY_ROWS)
  paintMeteors(meteors)

  let id = 0
  const nextId = () => ++id
  const head = sceneHead(SKY_COLS, SKY_ROWS, PALETTE)
  return {
    ...head,
    style: stylePatch({ shape: 'sparkle', shapeParams: { thickness: 0.3 } }).style,
    bg: '#0b1026',
    connectorWidth: 0.3,
    layers: [
      makeLayer(nextId(), 'Небо', [
        makeObj(nextId(), 'Звёздная пыль', dust),
        makeObj(nextId(), 'Метеоры', meteors),
        ...FIGURES.map((fig) => makeFigure(nextId(), fig)),
      ]),
    ],
    nextNodeId: id + 1,
    fuseObjects: false,
  }
}
