import { bench, describe } from 'vitest'

import { flatBenchDoc, sceneBenchDoc } from '../bench-doc.util.ts'
import { serialize } from './project-json.ts'
import { deserialize } from './project.ts'

/**
 * Persistence costs as they run today: autosave encodes the whole doc every 800 ms on the main
 * thread, and a canvas-sized flat doc clone (`.slice()`) is the floor of every flat-path edit.
 */
const scene512 = sceneBenchDoc(512, 512, 50, 524)
const scene2048 = sceneBenchDoc(2048, 2048, 100, 2100)
const json512 = JSON.stringify(serialize(scene512))
const json2048 = JSON.stringify(serialize(scene2048))

const flat4096 = flatBenchDoc(4096, 4096, 0.05)
const cellObj4096 = new Uint32Array(4096 * 4096)

describe('autosave encode (serialize + JSON.stringify)', () => {
  bench(
    'scene 512², ~5% ink',
    () => {
      JSON.stringify(serialize(scene512))
    },
    { iterations: 20, warmupIterations: 2 },
  )
  bench(
    'scene 2048², ~10% ink',
    () => {
      JSON.stringify(serialize(scene2048))
    },
    { iterations: 6, warmupIterations: 1 },
  )
})

describe('load parse (JSON.parse + deserialize)', () => {
  bench(
    'scene 512², ~5% ink',
    () => {
      deserialize(JSON.parse(json512))
    },
    { iterations: 20, warmupIterations: 2 },
  )
  bench(
    'scene 2048², ~10% ink',
    () => {
      deserialize(JSON.parse(json2048))
    },
    { iterations: 6, warmupIterations: 1 },
  )
})

describe('flat-path edit floor (full-buffer clones per commit)', () => {
  bench(
    'cells.slice() 4096² (32 MB)',
    () => {
      flat4096.cells.slice()
    },
    { iterations: 50, warmupIterations: 5 },
  )
  bench(
    'cellObj.slice() 4096² (64 MB)',
    () => {
      cellObj4096.slice()
    },
    { iterations: 50, warmupIterations: 5 },
  )
})
