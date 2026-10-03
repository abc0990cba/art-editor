import { bench, describe } from 'vitest'

import { flatRunsBenchDoc } from '../bench-doc.util.ts'
import { buildGeometry } from './index.ts'
import { ensureTileGeometry } from './tiles.ts'

/**
 * Dirty-tile geometry cache — the pixels-mode commit lever (PERFLOG 2026-10-03). Cold = all tiles
 * built (first render / style or palette change); commit = one local edit rebuilding one 256² tile
 * of the partition. Each iteration builds a fresh doc identity — the cache is keyed per document,
 * so bench fns must not reuse one (rendered-output identity is pinned by geometry/tiles.test.ts).
 */

const doc2048 = { ...flatRunsBenchDoc(2048, 2048, 0.15), styleScope: 'global' as const }
// the PREV document must be in the tile cache for the diff path (stable fixture, never iterated)
ensureTileGeometry(null, doc2048)

describe('dirty-tile geometry (2048², 15% runs)', () => {
  bench('whole-document rebuild (fallback path)', () => {
    buildGeometry(doc2048)
  })

  bench('tile path, cold — all 64 tiles, fresh doc identity', () => {
    ensureTileGeometry(null, { ...doc2048 })
  })

  bench('tile path, local edit — buffer slice + diff + 1 dirty tile', () => {
    const cells = doc2048.cells.slice()
    cells.fill(2, 300 * 2048 + 300, 300 * 2048 + 360)
    ensureTileGeometry(doc2048, { ...doc2048, cells })
  })
})
