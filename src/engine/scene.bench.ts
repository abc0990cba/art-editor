import { bench, describe } from 'vitest'

import { sceneBenchDoc, strokeCells } from './bench-doc.util.ts'
import type { Doc } from './doc.ts'
import { elementFromDoc } from './doc.ts'
import { appendToLayer, newObj, syncDoc, type SceneLayer } from './scene.ts'

/**
 * Scene compositing (syncDoc → buildComposite) is the engine share of every commit: any tree
 * mutation creates a fresh layers array, which invalidates the composite cache and rebuilds the
 * flat buffers for the whole canvas. Each bench iterates with a fresh layers array on purpose.
 */
const scene512 = sceneBenchDoc(512, 512, 50, 524)
const scene2048 = sceneBenchDoc(2048, 2048, 100, 2100)

function rebuiltLayers(doc: Doc): SceneLayer[] {
  return [...(doc.layers ?? [])]
}

/**
 * The engine path of a stroke commit: append one fresh object with the stroke's ink, then rebuild
 * the composite. Mirrors what paint.slice's commitStroke does, expressed in engine calls only.
 */
function commitStrokeEngine(doc: Doc, ink: Map<number, number>): Doc {
  const layer = doc.layers?.at(-1)
  if (!layer) return doc
  const er = newObj(doc, elementFromDoc(doc))
  er.obj.cells = ink
  return syncDoc({ ...er.doc, layers: appendToLayer(er.doc.layers!, layer.id, er.obj) })
}

const inkSmall = strokeCells(2000, 64 * 512 + 32)
const inkMid = strokeCells(2000, 64 * 2048 + 32)
const inkBig = strokeCells(2000, 64 * 4096 + 32)
const big4096 = sceneBenchDoc(4096, 4096, 100, 8400)

describe('syncDoc (composite rebuild on tree change)', () => {
  bench(
    'scene 512², 50 objs',
    () => {
      syncDoc({ ...scene512, layers: rebuiltLayers(scene512) })
    },
    { iterations: 20, warmupIterations: 2 },
  )
  bench(
    'scene 2048², 100 objs',
    () => {
      syncDoc({ ...scene2048, layers: rebuiltLayers(scene2048) })
    },
    { iterations: 8, warmupIterations: 1 },
  )
})

describe('stroke commit engine path (append obj + composite rebuild)', () => {
  bench(
    'commit 2000 cells on 512²',
    () => {
      commitStrokeEngine(scene512, inkSmall)
    },
    { iterations: 20, warmupIterations: 2 },
  )
  bench(
    'commit 2000 cells on 2048²',
    () => {
      commitStrokeEngine(scene2048, inkMid)
    },
    { iterations: 8, warmupIterations: 1 },
  )
  bench(
    'commit 2000 cells on 4096²',
    () => {
      commitStrokeEngine(big4096, inkBig)
    },
    { iterations: 3, warmupIterations: 1 },
  )
})
