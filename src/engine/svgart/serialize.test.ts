import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { mustHex, ringShape } from './index.ts'
import { FORBIDDEN_RE, sceneToSvg } from './index.ts'
import { softSpotLayer } from './index.ts'
import { starScene } from './index.ts'
import type { Paint, SvgScene } from './index.ts'

/**
 * Serialization contract tests + golden fixtures. The golden file pins the exact bytes of three
 * representative scenes (the studio's output is its product — regenerated SVGs must be a conscious
 * change). Refresh after an INTENTIONAL format change: `UPDATE_SVGART_GOLDENS=1 npx vitest run
 * src/engine/svgart/serialize.test.ts`
 */

const GOLDEN_PATH = join(import.meta.dirname, 'svgart-golden.json')

const ORANGE = mustHex('#ff8000')
const PURPLE = mustHex('#330099')
const WHITE = mustHex('#ffffff')

const linearPaint: Paint = {
  kind: 'linear',
  p1: { x: 10, y: 20 },
  p2: { x: 110, y: 20 },
  stops: [
    { offset: 0, color: ORANGE, alpha: 1 },
    { offset: 0.5, color: mustHex('#c85b23'), alpha: 0.5 },
    { offset: 1, color: PURPLE, alpha: 1 },
  ],
  alpha: 1,
}

const scenes: Record<string, SvgScene> = {
  'linear-and-solid': {
    width: 200,
    height: 100,
    background: { kind: 'solid', color: mustHex('#20242b'), alpha: 1 },
    layers: [
      {
        id: 'a',
        name: 'A',
        visible: true,
        opacity: 1,
        shape: { kind: 'rect', cx: { x: 60, y: 50 }, w: 80, h: 60, radius: 8, rotation: 0 },
        fills: [linearPaint],
      },
      {
        id: 'b',
        name: 'B',
        visible: true,
        opacity: 0.5,
        shape: { kind: 'ellipse', cx: { x: 150, y: 50 }, rx: 30, ry: 20, rotation: 0 },
        fills: [{ kind: 'solid', color: WHITE, alpha: 0.75 }],
      },
    ],
  },
  'radial-user-and-bbox': {
    width: 200,
    height: 200,
    background: null,
    layers: [
      {
        id: 'user',
        name: 'User radial',
        visible: true,
        opacity: 1,
        shape: { kind: 'rect', cx: { x: 50, y: 50 }, w: 80, h: 80, radius: 0, rotation: 0 },
        fills: [
          {
            kind: 'radial',
            units: 'user',
            cx: 50,
            cy: 50,
            r: 40,
            fx: 40,
            fy: 40,
            stops: [
              { offset: 0, color: WHITE, alpha: 1 },
              { offset: 1, color: ORANGE, alpha: 0 },
            ],
            alpha: 1,
          },
        ],
      },
      softSpotLayer('soft', 'Soft', {
        cx: 140,
        cy: 120,
        rx: 50,
        ry: 20,
        color: PURPLE,
        alpha: 0.4,
        core: 0.2,
      }),
    ],
  },
  'star-template': starScene(),
}

function assertAiSafe(svg: string): void {
  expect(svg).not.toMatch(FORBIDDEN_RE)
}

describe('sceneToSvg markup', () => {
  it('serializes user-space linear gradients with baked coordinates', () => {
    const svg = sceneToSvg(scenes['linear-and-solid']!)
    assertAiSafe(svg)
    expect(svg).toContain(
      '<linearGradient id="g0f0" gradientUnits="userSpaceOnUse" x1="10" y1="20" x2="110" y2="20">',
    )
    expect(svg).toContain('<stop offset="0.5" stop-color="#c85b23" stop-opacity="0.5"/>')
    expect(svg).toContain('fill-opacity="0.75"')
    expect(svg).toContain('<g opacity="0.5">')
  })

  it('serializes user radials with focus and bbox radials in fractions', () => {
    const svg = sceneToSvg(scenes['radial-user-and-bbox']!)
    assertAiSafe(svg)
    expect(svg).toContain(
      '<radialGradient id="g0f0" gradientUnits="userSpaceOnUse" cx="50" cy="50" r="40" fx="40" fy="40">',
    )
    expect(svg).toContain('<stop offset="1" stop-color="#ff8000" stop-opacity="0"/>')
    // The soft spot uses objectBoundingBox (default, attribute omitted) with a core plateau.
    expect(svg).toContain('<radialGradient id="g1f0" cx="0.5" cy="0.5" r="0.5">')
    expect(svg).toContain('<stop offset="0.2" stop-color="#330099" stop-opacity="0.4"/>')
  })

  it('skips hidden layers and empty fills', () => {
    const scene: SvgScene = {
      width: 10,
      height: 10,
      background: null,
      layers: [
        {
          id: 'h',
          name: 'Hidden',
          visible: false,
          opacity: 1,
          shape: { kind: 'rect', cx: { x: 5, y: 5 }, w: 4, h: 4, radius: 0, rotation: 0 },
          fills: [linearPaint],
        },
        {
          id: 'e',
          name: 'Empty',
          visible: true,
          opacity: 1,
          shape: { kind: 'rect', cx: { x: 5, y: 5 }, w: 4, h: 4, radius: 0, rotation: 0 },
          fills: [],
        },
      ],
    }
    const svg = sceneToSvg(scene)
    expect(svg).not.toContain('<defs>')
    expect(svg).not.toContain('<path')
    expect(svg).toContain('<svg')
  })

  it('emits fill-rule evenodd for ring paths', () => {
    const scene: SvgScene = {
      width: 100,
      height: 100,
      background: null,
      layers: [
        {
          id: 'ring',
          name: 'Ring',
          visible: true,
          opacity: 1,
          shape: ringShape({ x: 50, y: 50 }, 30, 12),
          fills: [{ kind: 'solid', color: WHITE, alpha: 1 }],
        },
      ],
    }
    const svg = sceneToSvg(scene)
    expect(svg).toContain('fill-rule="evenodd"')
    assertAiSafe(svg)
  })

  it('emits no defs when only solid paints exist', () => {
    const svg = sceneToSvg(scenes['linear-and-solid']!)
    expect(svg).toContain('<defs>')
    const solidOnly: SvgScene = { ...scenes['linear-and-solid']!, layers: [] }
    expect(sceneToSvg(solidOnly)).not.toContain('<defs>')
  })
})

describe('golden fixtures', () => {
  const names = Object.keys(scenes)
  const current = (): Record<string, string> =>
    Object.fromEntries(names.map((n) => [n, sceneToSvg(scenes[n]!)]))

  it('matches the pinned output byte-for-byte', () => {
    const rendered = current()
    if (process.env['UPDATE_SVGART_GOLDENS'] === '1') {
      writeFileSync(GOLDEN_PATH, `${JSON.stringify(rendered, null, 2)}\n`)
    }
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as Record<string, string>
    for (const n of names) {
      expect(rendered[n]).toBe(golden[n])
      assertAiSafe(rendered[n]!)
    }
  })
})
