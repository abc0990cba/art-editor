import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { TextureSettings } from '../core/doc.ts'
import { figureSpace } from './figure.ts'
import { regionTextureFragments, type TextureCell } from './index.ts'

/**
 * Golden parity fixtures for the region texture scan. The engine guarantees byte-identical baked
 * patterns across canvas, PNG and SVG export, and the scan was optimized under the contract that
 * existing settings reproduce their exact fragments (see PERFLOG). This suite pins the emitted path
 * strings of a settings × region matrix so an optimization that shifts a seeded fleck or dot fails
 * here instead of silently changing baked artwork.
 *
 * Regenerate after an INTENTIONAL output change: `UPDATE_TEXTURE_GOLDENS=1 npx vitest run
 * src/engine/texture/texture-golden.test.ts` and call out the visual delta in the change notes.
 */

const GOLDEN_PATH = join(import.meta.dirname, 'texture-golden.json')

const DEFAULTS: Omit<TextureSettings, 'effect'> = {
  amount: 60,
  scale: 1,
  sizeMin: 0.12,
  sizeMax: 0.35,
  shape: 'square',
  edge: 100,
  dist: 'scatter',
  gap: 0,
  gapMode: 'cell',
  even: false,
  angle: 45,
  seed: 1,
  jitter: 0,
  variation: 0,
  wobble: 0,
  merge: 0,
  dropout: 0,
  spray: 0,
  ramp: 0,
}

const settings = (patch: Partial<TextureSettings>): TextureSettings => ({
  effect: 'grain',
  ...DEFAULTS,
  ...patch,
})

/** Rect of 0.88-wide rounded cells spanning w×h tiles at tile offset (ox, oy). */
function rectCells(w: number, h: number, ox = 3, oy = 2, hole?: [number, number]): TextureCell[] {
  const list: TextureCell[] = []
  const isHole = (x: number, y: number) => hole !== undefined && x === hole[0] && y === hole[1]
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && !isHole(x, y)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isHole(x, y)) continue
      list.push({
        x: ox + x + 0.06,
        y: oy + y + 0.06,
        w: 0.88,
        h: 0.88,
        radii: [0.2, 0.2, 0.2, 0.2],
        chamfer: false,
        cx0: ox + x,
        cy0: oy + y,
        cx1: ox + x + 1,
        cy1: oy + y + 1,
        connectedL: at(x - 1, y),
        connectedT: at(x, y - 1),
        connectedR: at(x + 1, y),
        connectedB: at(x, y + 1),
      })
    }
  }
  // connected flags need the finished set — patch them in a second pass
  for (const c of list) {
    const gx = Math.round(c.cx0) - ox
    const gy = Math.round(c.cy0) - oy
    c.connectedL = at(gx - 1, gy)
    c.connectedT = at(gx, gy - 1)
    c.connectedR = at(gx + 1, gy)
    c.connectedB = at(gx, gy + 1)
  }
  return list
}

interface Case {
  id: string
  cells: TextureCell[]
  t: TextureSettings
  key: number
  fig?: boolean
}

const RECT = rectCells(8, 6)
const RECT_FIG = rectCells(10, 8, 1, 1)
const BIG = rectCells(48, 48, 0, 0)

function cases(): Case[] {
  const out: Case[] = []
  const add = (id: string, cells: TextureCell[], t: TextureSettings, key = 5, fig = false) =>
    out.push({ id, cells, t, key, fig })

  // scatter/grain — seeds, amounts, scales, distributions, shapes, gaps
  add('grain-seed7', RECT, settings({ seed: 7 }))
  add('grain-amount100', RECT, settings({ amount: 100 }))
  add('grain-scale03', RECT, settings({ scale: 0.3 }))
  add('grain-scale5', RECT, settings({ scale: 5 }))
  add('grain-even', RECT, settings({ even: true, amount: 90 }))
  add('grain-gap01', RECT, settings({ gap: 0.1 }))
  add('grain-dot', RECT, settings({ shape: 'dot' }))
  add('grain-chip', RECT, settings({ shape: 'chip', seed: 9 }))
  add('grain-star', RECT, settings({ shape: 'star', seed: 3 }))
  add('grain-ring-dash', RECT, settings({ shape: 'ring', seed: 4, amount: 40 }))
  add('grain-perlin', RECT, settings({ dist: 'perlin', seed: 11 }))
  add('grain-voronoi', RECT, settings({ dist: 'voronoi', seed: 12 }))
  add('grain-clumps', RECT, settings({ dist: 'clumps', seed: 13 }))
  add('grain-streaks', RECT, settings({ dist: 'streaks', angle: 30, seed: 14 }))
  add('grain-waves', RECT, settings({ dist: 'waves', seed: 15 }))
  add('grain-spiral', RECT, settings({ dist: 'spiral', seed: 16 }))
  add('grain-honeycomb', RECT, settings({ dist: 'honeycomb', seed: 17 }))
  add('grain-scales', RECT, settings({ dist: 'scales', seed: 18 }))
  add('grain-weave', RECT, settings({ dist: 'weave', seed: 19 }))
  add('grain-checker', RECT, settings({ dist: 'checker', seed: 20 }))
  add('grain-bayer', RECT, settings({ dist: 'bayer', seed: 21 }))
  add('grunge-edge50', RECT, settings({ effect: 'grunge', edge: 50, seed: 22 }))
  add('grunge-wear', RECT, settings({ effect: 'grunge', edge: 100, amount: 80, seed: 23 }))
  add('grain-figure-gap', RECT_FIG, settings({ gap: 0.12, gapMode: 'figure', seed: 24 }), 5, true)
  add('grain-big', BIG, settings({ seed: 25, amount: 50, scale: 0.5 }))
  add('grain-key', RECT, settings({ seed: 7 }), 77)

  // halftone — screen grid + distress knobs + lattice
  add('ht-grid', RECT, settings({ effect: 'halftone', amount: 50, angle: 45, seed: 2 }))
  add(
    'ht-knobs',
    RECT,
    settings({
      effect: 'halftone',
      amount: 60,
      jitter: 20,
      variation: 30,
      wobble: 25,
      merge: 20,
      dropout: 15,
      spray: 10,
      ramp: 40,
      seed: 3,
    }),
  )
  add('ht-scale2', RECT, settings({ effect: 'halftone', amount: 45, scale: 2, seed: 4 }))

  // hatch — straight/cross, wobble, ramp, dropout
  add('hatch-straight', RECT, settings({ effect: 'hatch', amount: 30, scale: 2, seed: 5 }))
  add(
    'hatch-cross',
    RECT,
    settings({
      effect: 'hatch',
      amount: 30,
      scale: 2,
      hatchStyle: 'cross',
      seed: 6,
    }),
  )
  add(
    'hatch-wobble',
    RECT,
    settings({
      effect: 'hatch',
      amount: 40,
      wobble: 40,
      dropout: 20,
      ramp: 30,
      seed: 8,
    }),
  )
  return out
}

function figureOf(cells: TextureCell[]) {
  return figureSpace(cells, 1)
}

describe('texture golden parity', () => {
  it('reproduces the committed fragment strings', () => {
    const update = process.env['UPDATE_TEXTURE_GOLDENS'] === '1'
    const goldens: Record<string, string> = update
      ? {}
      : (JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as Record<string, string>)
    for (const c of cases()) {
      const frag = regionTextureFragments(
        c.cells,
        c.t,
        c.key,
        c.fig ? figureOf(c.cells) : undefined,
      )
      expect(frag, c.id).not.toBe('')
      if (update) goldens[c.id] = frag
      else expect(frag, c.id).toBe(goldens[c.id])
    }
    if (update) {
      writeFileSync(GOLDEN_PATH, JSON.stringify(goldens, null, 2) + '\n')
      expect(Object.keys(goldens).length).toBeGreaterThan(0)
    }
  })
})
