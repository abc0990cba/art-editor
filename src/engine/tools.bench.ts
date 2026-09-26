import { bench, describe } from 'vitest'

import { floodBenchDoc } from './bench-doc.util.ts'
import { floodFillDoc } from './floodfill.ts'
import { symmetryPoints } from './symmetry.ts'

/**
 * Tool kernels. Flood fill allocates a full-canvas mask per call and walks the connected region;
 * symmetryPoints is paid per stamped cell on every pointermove of a stroke.
 */
const disc512 = floodBenchDoc(512, 512, 0.15)
const disc2048 = floodBenchDoc(2048, 2048, 0.15)

const bw = 512
const bh = 512
const probes: [number, number][] = []
for (let k = 0; k < 2000; k++) probes.push([(k * 37) % bw, (k * 91) % bh])

function orbitBench(mode: Parameters<typeof symmetryPoints>[4], limit?: number): () => void {
  return () => {
    for (const [x, y] of probes) symmetryPoints(x, y, bw, bh, mode, 8, 16, undefined, limit)
  }
}

describe('floodFillDoc (region fill, r=15% disc)', () => {
  bench(
    '512² (~7% region)',
    () => {
      floodFillDoc(disc512.doc, disc512.start, 2)
    },
    { iterations: 20, warmupIterations: 2 },
  )
  bench(
    '2048² (~7% region)',
    () => {
      floodFillDoc(disc2048.doc, disc2048.start, 2)
    },
    { iterations: 6, warmupIterations: 1 },
  )
})

describe('symmetryPoints (×2000 calls, orbit per stamp)', () => {
  bench('mirrorX', orbitBench('mirrorX'), { iterations: 20, warmupIterations: 2 })
  bench('quad', orbitBench('quad'), { iterations: 20, warmupIterations: 2 })
  bench('diag8', orbitBench('diag8'), { iterations: 20, warmupIterations: 2 })
  bench('p4 (repeat 16)', orbitBench('p4'), { iterations: 20, warmupIterations: 2 })
  // the app stamps pass an orbit cap: enumeration short-circuits instead of slicing after
  bench('p4 (repeat 16, stamp limit 64)', orbitBench('p4', 64), {
    iterations: 20,
    warmupIterations: 2,
  })
})
