import { bench, describe } from 'vitest'

import type { TextureSettings } from '../core/doc.ts'
import { regionTextureFragments, type TextureCell } from './index.ts'
import { FNV_OFFSET, fnvWord } from './region-index.ts'

/**
 * Region texture scan cost by region size and effect — the numbers behind the PERFLOG rows for the
 * texture-engine optimization (bitmap region index, keep-bound rejection, scan cap, fragment
 * cache). Fixtures are plain square cells (the pixel-mode worst case for region area). Cold cases
 * pass an integer digest like the geometry callers do (the production pattern); one case measures
 * the digest-from-cells fallback used by direct callers without buffer coordinates.
 */

const DEFAULTS: Omit<TextureSettings, 'effect'> = {
  amount: 50,
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

/** Filled n×n cell region of plain 0.88 squares with true connectivity flags. */
function rectRegion(n: number): TextureCell[] {
  const list: TextureCell[] = []
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      list.push({
        x: x + 0.06,
        y: y + 0.06,
        w: 0.88,
        h: 0.88,
        radii: [0, 0, 0, 0],
        chamfer: false,
        cx0: x,
        cy0: y,
        cx1: x + 1,
        cy1: y + 1,
        connectedL: x > 0,
        connectedT: y > 0,
        connectedR: x < n - 1,
        connectedB: y < n - 1,
      })
    }
  }
  return list
}

/** Integer region digest, mixed the same way the geometry callers mix it. */
function digestOf(cells: TextureCell[]): number {
  let acc = FNV_OFFSET
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    acc = fnvWord(fnvWord(fnvWord(acc, Math.round(c.cx0)), Math.round(c.cy0)), i & 15)
  }
  return acc
}

const R128 = rectRegion(128)
const R512 = rectRegion(512)
const R2048 = rectRegion(2048)
const D128 = digestOf(R128)
const D512 = digestOf(R512)
const D2048 = digestOf(R2048)

/** Per-call nonce so every invocation is a cache miss — the honest cold-scan cost. */
let nonce = 100

describe('region texture scan', () => {
  bench('grain 128² region (amount 50) — cold', () => {
    regionTextureFragments(R128, settings({ seed: nonce++ }), 5, undefined, D128)
  })

  bench('grain 512² region (amount 50) — cold', () => {
    regionTextureFragments(R512, settings({ seed: nonce++ }), 5, undefined, D512)
  })

  bench('grain 2048² region (amount 50) — cold, scan-capped', () => {
    regionTextureFragments(R2048, settings({ seed: nonce++ }), 5, undefined, D2048)
  })

  bench('grain 512² region, scale 0.1 — cold, scan-capped worst case', () => {
    regionTextureFragments(R512, settings({ seed: nonce++, scale: 0.1 }), 5, undefined, D512)
  })

  bench('grain 512² region — fragment cache hit', () => {
    regionTextureFragments(R512, settings({ seed: 7 }), 5, undefined, D512)
  })

  bench('grain 512² region — digest fallback (no caller digest)', () => {
    regionTextureFragments(R512, settings({ seed: 8 }), 5)
  })

  bench('halftone 512² region (amount 50) — cold', () => {
    regionTextureFragments(
      R512,
      settings({ effect: 'halftone', seed: nonce++, amount: 50 }),
      5,
      undefined,
      D512,
    )
  })

  bench('grunge 512² region (edge 100) — cold', () => {
    regionTextureFragments(R512, settings({ effect: 'grunge', seed: nonce++ }), 5, undefined, D512)
  })
})
