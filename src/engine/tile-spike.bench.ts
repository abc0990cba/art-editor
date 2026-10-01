import { bench, describe } from 'vitest'

import { flatBenchDoc, sceneBenchDoc } from './bench-doc.util.ts'
import type { Doc } from './doc.ts'
import { buildGeometry } from './geometry.ts'
import { syncDoc, type SceneObj } from './scene.ts'

/**
 * Tile data model spike — the lever PERFLOG M1/M5/M6 converged on (commit 4096² is 130 ms vs the 16
 * ms budget; the residue is whole-canvas composite + geometry). Measures the granularity property a
 * tiled model would buy, without touching production code:
 *
 * 1. Overhead check — per-tile buildGeometry over the full partition vs one whole-canvas pass;
 * 2. The lever — a local edit rebuilds only its tiles: O(changed tiles) instead of O(canvas);
 * 3. Composite — full rebuild vs the patch floor (buffer slices + repaint of one object).
 *
 * Known seam effect: runs that cross a tile border split into two fragments. On scatter ink runs
 * are single cells, so tile fragmentation here is negligible; run-friendly ink needs tile-aligned
 * merging in a real implementation (noted in docs/research/performance.md).
 */

const TILE = 256

function tileDoc(doc: Doc, tx: number, ty: number): Doc {
  const bw = doc.cols
  const cells = new Uint16Array(TILE * TILE)
  for (let y = 0; y < TILE; y++) {
    const row = (ty * TILE + y) * bw + tx * TILE
    cells.set(doc.cells.subarray(row, row + TILE), y * TILE)
  }
  return { ...doc, cols: TILE, rows: TILE, cells }
}

const flat2048 = flatBenchDoc(2048, 2048, 0.05)

function firstObj(doc: Doc): SceneObj {
  const layer = doc.layers?.[0]
  if (!layer) throw new Error('scene fixture expected')
  for (const item of layer.children) if (item.kind === 'obj') return item
  throw new Error('no objects in fixture')
}

describe('tile spike — geometry rebuild granularity (2048², 5% scatter ink)', () => {
  bench(
    'whole-canvas rebuild (today)',
    () => {
      buildGeometry(flat2048)
    },
    { iterations: 6, warmupIterations: 1 },
  )
  bench(
    'tiled rebuild: all 64 tiles, extraction included',
    () => {
      for (let ty = 0; ty < 8; ty++)
        for (let tx = 0; tx < 8; tx++) buildGeometry(tileDoc(flat2048, tx, ty))
    },
    { iterations: 3, warmupIterations: 1 },
  )
  bench(
    'local edit: 4 dirty tiles = 1.6% of the canvas',
    () => {
      buildGeometry(tileDoc(flat2048, 3, 2))
      buildGeometry(tileDoc(flat2048, 4, 2))
      buildGeometry(tileDoc(flat2048, 3, 3))
      buildGeometry(tileDoc(flat2048, 4, 3))
    },
    { iterations: 20, warmupIterations: 2 },
  )
})

describe('tile spike — composite: full rebuild vs patch floor (2048², 100 objs)', () => {
  const scene = sceneBenchDoc(2048, 2048, 100, 2100)
  const obj = firstObj(scene)
  bench(
    'syncDoc: full composite rebuild after a tree change',
    () => {
      syncDoc({
        ...scene,
        layers: [{ ...scene.layers![0], children: [...scene.layers![0].children] }],
      })
    },
    { iterations: 6, warmupIterations: 1 },
  )
  bench(
    'patch floor: buffer slices + repaint one object (2100 cells)',
    () => {
      const cells = scene.cells.slice()
      const cellObj = scene.cellObj!.slice()
      for (const [i, v] of obj.cells) {
        cells[i] = v
        cellObj[i] = obj.id
      }
    },
    { iterations: 20, warmupIterations: 2 },
  )
})
