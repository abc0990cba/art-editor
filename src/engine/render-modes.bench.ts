import { bench, describe } from 'vitest'

import { flatBenchDoc } from './bench-doc.util.ts'
import { buildGeometry } from './geometry.ts'
import { makeGrid } from './grids.ts'

/**
 * Full-rebuild costs of the render modes and grids that have no bench coverage: outline and
 * metaball (both full-buffer field passes per color), baked texture (the per-commit stroke
 * fallback), and a non-square grid (generic per-cell path). These are the modes where the
 * in-stroke preview falls back to buildGeometry on every rAF frame — their rebuild cost IS the
 * per-frame cost.
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
  const target = Math.round(grid.count * 0.05)
  let placed = 0
  let seed = 512 * 7919
  while (placed < target) {
    seed = (seed * 1103515245 + 12345) & 0x7fff_ffff
    const i = seed % grid.count
    if (cells[i] === 0) {
      cells[i] = (seed >>> 8) % 2 ? 1 : 2
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
    { iterations: 15, warmupIterations: 2 },
  )
  bench(
    'outline 512², 5%',
    () => {
      buildGeometry(outline512)
    },
    { iterations: 10, warmupIterations: 2 },
  )
  bench(
    'outline 2048², 5%',
    () => {
      buildGeometry(outline2048)
    },
    { iterations: 3, warmupIterations: 1 },
  )
  bench(
    'metaball 512², 5%',
    () => {
      buildGeometry(metaball512)
    },
    { iterations: 8, warmupIterations: 1 },
  )
  bench(
    'grain texture 512², 5%',
    () => {
      buildGeometry(grain512)
    },
    { iterations: 8, warmupIterations: 1 },
  )
  bench(
    'triangle grid 512², 5%',
    () => {
      buildGeometry(triangle512)
    },
    { iterations: 8, warmupIterations: 1 },
  )
})
