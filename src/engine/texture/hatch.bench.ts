import { bench, describe } from 'vitest'

import type { TextureSettings } from '../core/doc.ts'
import { regionTextureFragments } from './region.ts'
import type { TextureCell } from './region.ts'

/**
 * Hatch texture cost: the geometry rebuild runs it on every same-color region at commit/param time,
 * so the number to watch is the fragment cost of a dense region against the halftone baseline.
 * First baseline 2026-10-02 with add-line-systems (see bench/PERFLOG.md).
 */

const N = 128

const cells = (): TextureCell[] => {
  const out: TextureCell[] = []
  for (let gy = 0; gy < N; gy++) {
    for (let gx = 0; gx < N; gx++) {
      const same = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < N && yy < N
      out.push({
        x: gx + 0.05,
        y: gy + 0.05,
        w: 0.9,
        h: 0.9,
        radii: [0, 0, 0, 0],
        chamfer: false,
        cx0: gx,
        cy0: gy,
        cx1: gx + 1,
        cy1: gy + 1,
        connectedL: same(gx - 1, gy),
        connectedT: same(gx, gy - 1),
        connectedR: same(gx + 1, gy),
        connectedB: same(gx, gy + 1),
      })
    }
  }
  return out
}

const region = cells()

const settings = (over: Partial<TextureSettings>): TextureSettings => ({
  effect: 'hatch',
  amount: 45,
  scale: 2,
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
  ...over,
})

describe('hatch texture fragments, 128² region', () => {
  bench('hatch straight (scale 2, amount 45)', () => {
    regionTextureFragments(region, settings({}), 1)
  })
  bench('hatch straight + wobble 40', () => {
    regionTextureFragments(region, settings({ wobble: 40 }), 1)
  })
  bench('hatch cross', () => {
    regionTextureFragments(region, settings({ hatchStyle: 'cross' }), 1)
  })
  bench('halftone grid (baseline)', () => {
    regionTextureFragments(region, settings({ effect: 'halftone', shape: 'dot' }), 1)
  })
})
