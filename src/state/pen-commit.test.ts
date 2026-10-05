import { beforeEach, describe, expect, it } from 'vitest'

import { defaultDoc } from '../engine/core/doc.ts'
import { serialize } from '../engine/core/project-json.ts'
import { deserializeInternal } from '../engine/core/project-parse.ts'
import { allObjs, ensureScene } from '../engine/core/scene.ts'
import { pathFromD, pathToD, pathInk, type CurvePath, type Pt } from '../engine/curves/index.ts'
import { redo, undo, useStore } from './editor.store'

const state = () => useStore.getState()
const W = 32 // defaultDoc width

/** Two anchors with bezier handles — the shape a pen click-drag produces. */
const draft: CurvePath = {
  anchors: [
    { x: 4.5, y: 10.5, hIn: null, hOut: [6.5, 6.5] as Pt },
    { x: 12.5, y: 14.5, hIn: [10.5, 18.5] as Pt, hOut: null },
  ],
  closed: false,
}

/** A second curve for the re-edit round: same anchors, bent the other way. */
const edited: CurvePath = {
  anchors: [
    { x: 4.5, y: 10.5, hIn: null, hOut: [6.5, 14.5] as Pt },
    { x: 12.5, y: 14.5, hIn: [10.5, 6.5] as Pt, hOut: null },
  ],
  closed: false,
}

const paramsOf = (p: CurvePath) => ({
  d: pathToD(p),
  w: 2,
  stroke: true,
  fillMode: 'none',
  strokeColor: '#ffffff',
  fillColor: '#000000',
})

/** Rasterized ink of a path as paintCellsValues expects it (width-1 stroke, palette value 1). */
const inkOf = (p: CurvePath): Map<number, number> => {
  const ink = pathInk(p, W, W, { width: 1, fill: false })
  return new Map([...ink.stroke].map((i) => [i, 1]))
}

/** The `source.bezier` params of the first committed object, found through the scene tree. */
function bezierParamsOfFirstObj(): Record<string, number | string | boolean> {
  const objs = allObjs(state().doc.layers!)
  expect(objs).toHaveLength(1)
  const node = objs[0].graph?.nodes.find((n) => n.op === 'source.bezier')
  expect(node).toBeDefined()
  return node!.params
}

/** The history push trails the commit by the 350 ms throttle — wait it out before undoing. */
const settleHistory = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 400)
  })

describe('pen curve commit (parametric persistence)', () => {
  beforeEach(() => {
    useStore.setState({ doc: ensureScene(defaultDoc()), selection: [] })
  })

  it('committing lands a source.bezier object whose d param regenerates the drafted path', () => {
    state().paintCellsValues(inkOf(draft), state().doc, {
      op: 'source.bezier',
      params: paramsOf(draft),
    })
    const back = pathFromD(String(bezierParamsOfFirstObj()['d']))
    expect(back).not.toBeNull()
    expect(back).toEqual(draft)
  })

  it('the committed curve is one undoable step and redo restores it with handles', async () => {
    state().paintCellsValues(inkOf(draft), state().doc, {
      op: 'source.bezier',
      params: paramsOf(draft),
    })
    await settleHistory()
    undo()
    expect(allObjs(state().doc.layers!)).toHaveLength(0)
    redo()
    const back = pathFromD(String(bezierParamsOfFirstObj()['d']))
    expect(back).toEqual(draft)
  })

  it('the d param with handles survives the project save/load round trip', () => {
    state().paintCellsValues(inkOf(draft), state().doc, {
      op: 'source.bezier',
      params: paramsOf(draft),
    })
    const back = deserializeInternal(JSON.parse(JSON.stringify(serialize(state().doc))))
    const objs = allObjs(back.layers!)
    expect(objs).toHaveLength(1)
    const node = objs[0].graph?.nodes.find((n) => n.op === 'source.bezier')
    expect(pathFromD(String(node?.params['d']))).toEqual(draft)
  })

  it('re-edit commit swaps the params in place — same object, new curve, no extra objects', () => {
    state().paintCellsValues(inkOf(draft), state().doc, {
      op: 'source.bezier',
      params: paramsOf(draft),
    })
    const objs = allObjs(state().doc.layers!)
    state().beginPen({ path: edited, replaceObjId: objs[0].id })
    state().commitPenReplace(inkOf(edited), paramsOf(edited))
    expect(allObjs(state().doc.layers!)).toHaveLength(1)
    const back = pathFromD(String(bezierParamsOfFirstObj()['d']))
    expect(back).toEqual(edited)
  })
})
