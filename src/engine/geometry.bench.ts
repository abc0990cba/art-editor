import { bench, describe } from 'vitest'

import { flatBenchDoc, flatRunsBenchDoc, sceneBenchDoc, strokeStaging } from './bench-doc.util.ts'
import { buildGeometry, stagingPreview } from './geometry.ts'

/**
 * Full-document geometry rebuild — the cost every commit, zoom, pan and resize pays today. Ink is
 * scattered (isolated cells), so each painted cell is one path fragment: the pessimistic case for
 * the current per-cell path-string pipeline and the best case for a future RLE one.
 */
const flat512a = flatBenchDoc(512, 512, 0.05)
const flat512b = flatBenchDoc(512, 512, 0.15)
const flat512c = flatBenchDoc(512, 512, 0.3)
const flat2048a = flatBenchDoc(2048, 2048, 0.05)
const flat2048b = flatBenchDoc(2048, 2048, 0.15)
const flat4096 = flatBenchDoc(4096, 4096, 0.05)
/** Run-friendly ink (band rows of run-length-8 cells, 50% coverage) — classic pixel-art stripes. */
const runs512 = flatRunsBenchDoc(512, 512, 0.5)
const runs4096 = flatRunsBenchDoc(4096, 4096, 0.5)

/** Cell-form variants of the flat docs: same cells, per-cell form rendering (no run merging). */
const circles512a = { ...flat512a, style: { ...flat512a.style, shape: 'circle' as const } }
const circlesRuns512 = { ...runs512, style: { ...runs512.style, shape: 'circle' as const } }

/** Scene rebuild: 50/100 objects of random-walk clusters on one layer (~5–10% ink). */
const scene2048 = sceneBenchDoc(2048, 2048, 100, 2100)

/** In-stroke preview frames: only the staged cells, the path a pencil stroke pays per rAF. */
const stage512 = strokeStaging(512, 1500)
const stage4096 = strokeStaging(4096, 1500)

describe('buildGeometry (full-document rebuild)', () => {
  bench(
    'flat 512², 5% ink',
    () => {
      buildGeometry(flat512a)
    },
    { iterations: 20, warmupIterations: 2 },
  )
  bench(
    'flat 512², 15% ink',
    () => {
      buildGeometry(flat512b)
    },
    { iterations: 15, warmupIterations: 2 },
  )
  bench(
    'flat 512², 30% ink',
    () => {
      buildGeometry(flat512c)
    },
    { iterations: 10, warmupIterations: 1 },
  )
  bench(
    'flat 2048², 5% ink',
    () => {
      buildGeometry(flat2048a)
    },
    { iterations: 8, warmupIterations: 1 },
  )
  bench(
    'flat 2048², 15% ink',
    () => {
      buildGeometry(flat2048b)
    },
    { iterations: 4, warmupIterations: 1 },
  )
  bench(
    'flat 4096², 5% ink',
    () => {
      buildGeometry(flat4096)
    },
    { iterations: 3, warmupIterations: 1 },
  )
  bench(
    'scene 2048², 100 objs (~10% ink)',
    () => {
      buildGeometry(scene2048)
    },
    { iterations: 4, warmupIterations: 1 },
  )
  bench(
    'flat 512², 50% runs-64',
    () => {
      buildGeometry(runs512)
    },
    { iterations: 10, warmupIterations: 1 },
  )
  bench(
    'flat 4096², 50% runs-64',
    () => {
      buildGeometry(runs4096)
    },
    { iterations: 3, warmupIterations: 1 },
  )
  bench(
    'flat 512², 5% ink, circles',
    () => {
      buildGeometry(circles512a)
    },
    { iterations: 20, warmupIterations: 2 },
  )
  bench(
    'flat 512², 50% runs-64, circles',
    () => {
      buildGeometry(circlesRuns512)
    },
    { iterations: 10, warmupIterations: 1 },
  )
})

describe('stagingPreview (in-stroke frame, 1500 staged cells)', () => {
  bench(
    'flat 512²',
    () => {
      stagingPreview(flat512a, stage512)
    },
    { iterations: 30, warmupIterations: 3 },
  )
  bench(
    'flat 4096²',
    () => {
      stagingPreview(flat4096, stage4096)
    },
    { iterations: 20, warmupIterations: 2 },
  )
})
