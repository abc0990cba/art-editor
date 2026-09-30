import { bench, describe } from 'vitest'

import { flatBenchDoc, mulberry32 } from './bench-doc.util.ts'
import { buildGeometry } from './geometry.ts'
import { makeGrid } from './grids.ts'

/**
 * Full-rebuild costs of the render modes and grids that had no bench coverage: outline and metaball
 * (both full-buffer field passes per color), baked texture (the per-commit stroke fallback), and a
 * non-square grid (generic per-cell path). These are the modes where the in-stroke preview falls
 * back to buildGeometry on every rAF frame — their rebuild cost IS the per-frame cost.
 *
 * `time` is capped on every point (tinybench floors each bench at its time budget): a texture
 * rebuild is ~2 s per call, so uncapped sampling would burn minutes per point. Grain runs its
 * explicit iterations and stops at the cap.
 */

const flat512 = flatBenchDoc(512, 512, 0.05)
const flat2048 = flatBenchDoc(2048, 2048, 0.05)

const outline512 = { ...flat512, renderMode: 'outline' as const }
const outline2048 = { ...flat2048, renderMode: 'outline' as const }
const metaball512 = { ...flat512, renderMode: 'metaball' as const }
const grain512 = {
  ...flat512,
  texture: { ...flat512.texture, effect: 'grain' as const },
}

/** Triangle lattice: cell count differs from the square buffer, ink scattered over grid cells. */
const triCells = (() => {
  const grid = makeGrid('triangle', 512, 512)
  const cells = new Uint16Array(grid.count)
  const rng = mulberry32(512 * 7919)
  const target = Math.round(grid.count * 0.05)
  let placed = 0
  while (placed < target) {
    const i = Math.floor(rng() * grid.count)
    if (cells[i] === 0) {
      cells[i] = Math.floor(rng() * 2) + 1
      placed++
    }
  }
  return cells
})()
const triangle512 = { ...flat512, gridType: 'triangle' as const, cells: triCells }

describe('buildGeometry — render modes (full rebuild = per-frame fallback cost)', () => {
  bench(
    'pixels 512², 5% (reference)',
    () => {
      buildGeometry(flat512)
    },
    { time: 200, warmupIterations: 2 },
  )
  bench(
    'outline 512², 5%',
    () => {
      buildGeometry(outline512)
    },
    { time: 200, warmupIterations: 1 },
  )
  bench(
    'outline 2048², 5%',
    () => {
      buildGeometry(outline2048)
    },
    { iterations: 3, time: 2500, warmupIterations: 1 },
  )
  bench(
    'metaball 512², 5%',
    () => {
      buildGeometry(metaball512)
    },
    { time: 200, warmupIterations: 1 },
  )
  bench(
    'grain texture 512², 5%',
    () => {
      buildGeometry(grain512)
    },
    { iterations: 3, time: 6500, warmupIterations: 1 },
  )
  bench(
    'triangle grid 512², 5%',
    () => {
      buildGeometry(triangle512)
    },
    { time: 200, warmupIterations: 1 },
  )
})
