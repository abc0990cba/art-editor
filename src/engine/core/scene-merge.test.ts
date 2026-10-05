import { beforeEach, afterEach, describe, expect, it } from 'vitest'

import { useStore, undo } from '../../state/editor.store'
import { buildSvg } from '../output/svg.ts'
import { elementFromDoc, defaultDoc, type Doc, type ElementStyle } from './doc.ts'
import { mergeObjsByColor } from './scene-merge.ts'
import { allObjs, ensureScene, newGroup, newLayer, newObj, syncDoc } from './scene.ts'
import type { SceneGroup, SceneItem, SceneLayer, SceneObj } from './scene.ts'

const RED = '#ff0000'
const GREEN = '#00ff00'

/** The undo history throttles pushes (350 ms); tests wait out the window. */
const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

function baseDoc(): Doc {
  const doc = ensureScene(defaultDoc())
  return { ...doc, palette: [RED, GREEN], cols: 8, rows: 8, sub: 1 }
}

/** Threads nextNodeId through object/layer/group creation, like importSceneLayers does. */
function builder(doc: Doc) {
  let d = doc
  return {
    doc: () => d,
    obj(idxs: number[], v: number, style?: ElementStyle): SceneObj {
      const r = newObj(d, style ?? elementFromDoc(d))
      r.obj.cells = new Map(idxs.map((i) => [i, v]))
      d = r.doc
      return r.obj
    },
    group(children: SceneItem[]): SceneGroup {
      const r = newGroup(d)
      r.group.children = children
      d = r.doc
      return r.group
    },
    layer(children: SceneItem[], visible = true): SceneLayer {
      const r = newLayer(d)
      r.layer.children = children
      r.layer.visible = visible
      d = r.doc
      return r.layer
    },
  }
}

const ids = (layer: SceneLayer): number[] =>
  layer.children.map((c) => (c.kind === 'obj' ? c.id : -c.id))

describe('scene-merge: pure tree operation', () => {
  it('collapses same-color dots into one object per color, first member keeps id and slot', () => {
    const b = builder(baseDoc())
    const r1 = b.obj([0], 1)
    const g1 = b.obj([3], 2)
    const r2 = b.obj([9], 1)
    const g2 = b.obj([12], 2)
    const r3 = b.obj([18], 1)
    const layer = b.layer([r1, g1, r2, g2, r3])
    const res = mergeObjsByColor([layer])
    expect(res).not.toBeNull()
    const merged = res!.layers[0].children
    expect(merged).toHaveLength(2)
    const [red, green] = merged as SceneObj[]
    expect(red.id).toBe(r1.id)
    expect([...red.cells.keys()].sort((a, z) => a - z)).toEqual([0, 9, 18])
    expect(green.id).toBe(g1.id)
    expect(green.cells.size).toBe(2)
    expect(res!.idMap.get(r2.id)).toBe(r1.id)
    expect(res!.idMap.get(r3.id)).toBe(r1.id)
    expect(res!.idMap.get(g2.id)).toBe(g1.id)
    expect(ids(res!.layers[0])).toEqual([r1.id, g1.id])
  })

  it('the merged tree composites byte-identically', () => {
    const b = builder(baseDoc())
    const layer = b.layer([
      b.obj([0], 1),
      b.obj([3], 2),
      b.obj([9], 1),
      b.obj([12], 2),
      b.obj([18], 1),
    ])
    const before = syncDoc({ ...b.doc(), layers: [layer] })
    const res = mergeObjsByColor(before.layers!)
    expect(res).not.toBeNull()
    const after = syncDoc({ ...before, layers: res!.layers })
    expect(Array.from(after.cells)).toEqual(Array.from(before.cells))
  })

  it('guards: graphs, connectors, locks, hidden content, multi-color ink and style mismatch stay untouched', () => {
    const b = builder(baseDoc())
    const withGraph = b.obj([30], 1)
    withGraph.graph = { graphVersion: 1, nodes: [] }
    const withLink = b.obj([31], 1)
    withLink.links = [{ ax: 0, ay: 0, bx: 1, by: 1, v: 1 }]
    const locked = b.obj([32], 1)
    locked.locked = true
    const hidden = b.obj([33], 1)
    hidden.visible = false
    const multi = b.obj([34, 35], 1)
    multi.cells.set(36, 2)
    const plainA = b.obj([0], 1)
    const plainB = b.obj([9], 1)
    const styled = elementFromDoc(b.doc())
    const fancy = b.obj([18], 1, { ...styled, style: { ...styled.style, radius: 0.5 } })
    const layer = b.layer([withGraph, withLink, locked, hidden, multi, plainA, plainB, fancy])
    const res = mergeObjsByColor([layer])
    expect(res).not.toBeNull()
    const kids = res!.layers[0].children as SceneObj[]
    expect(kids).toHaveLength(7)
    const merged = kids.find((o) => o.id === plainA.id)!
    expect(merged.cells.size).toBe(2)
    // the styled dot differs in style, so it never joins the plain pair
    expect(res!.idMap.has(fancy.id)).toBe(false)
    expect(kids.some((o) => o.id === fancy.id)).toBe(true)
  })

  it('never merges across layers; a hidden layer is skipped entirely', () => {
    const b = builder(baseDoc())
    const l1 = b.layer([b.obj([0], 1)])
    const l2 = b.layer([b.obj([0], 1)])
    expect(mergeObjsByColor([l1, l2])).toBeNull()
    const hidden = b.layer([b.obj([1], 1), b.obj([2], 1)], false)
    expect(mergeObjsByColor([hidden])).toBeNull()
  })

  it('scope restricts the candidates; merge pulls members out of groups and drops the husk', () => {
    const b = builder(baseDoc())
    const a = b.obj([0], 1)
    const c = b.obj([18], 1)
    const inside = b.group([b.obj([9], 1), b.obj([10], 1)])
    const layer = b.layer([a, inside, c])
    // an empty scope set merges nothing (the store expands a selection or passes undefined)
    const res = mergeObjsByColor([layer], new Set())
    expect(res).toBeNull()
    // scope = the two dots inside the group: they unite, the outside dots stay
    const group = layer.children[1] as SceneGroup
    const inGroup = group.children as SceneObj[]
    const res2 = mergeObjsByColor([layer], new Set(inGroup.map((o) => o.id)))
    expect(res2).not.toBeNull()
    const kids = res2!.layers[0].children
    expect(kids).toHaveLength(3)
    const mergedGroup = kids[1] as SceneGroup
    expect((mergedGroup.children[0] as SceneObj).cells.size).toBe(2)
    // whole-tree merge: everything red becomes one object in the bottom-most slot, group husk gone
    const res3 = mergeObjsByColor([layer])
    expect(res3).not.toBeNull()
    expect(res3!.layers[0].children).toHaveLength(1)
    const merged = res3!.layers[0].children[0] as SceneObj
    expect(merged.id).toBe(a.id)
    expect(merged.cells.size).toBe(4)
  })

  it('no-op keeps the input tree identity; the input tree is never mutated', () => {
    const b = builder(baseDoc())
    const a = b.obj([0], 1)
    const layer = b.layer([a])
    expect(mergeObjsByColor([layer])).toBeNull()
    const two = b.layer([b.obj([0], 1), b.obj([9], 1)])
    const snapshot = JSON.stringify(two)
    const res = mergeObjsByColor([two])
    expect(res).not.toBeNull()
    expect(JSON.stringify(two)).toBe(snapshot)
    expect(two.children).toHaveLength(2)
    expect((two.children[0] as SceneObj).cells.size).toBe(1)
  })
})

describe('scene-merge: store integration', () => {
  beforeEach(() => {
    useStore.setState({ doc: ensureScene(defaultDoc()), selection: [], activeLayerId: null })
    useStore
      .getState()
      .patchImportLayering({ splitByColor: true, splitConnected: true, layerOrder: 'palette' })
  })
  afterEach(() => {
    useStore
      .getState()
      .patchImportLayering({ splitByColor: true, splitConnected: false, layerOrder: 'area' })
  })
  const state = () => useStore.getState()

  /** A rings-dither-like import: scattered single-cell dots of two colors on an 8×8 grid. */
  function importDots(): void {
    const cells = new Uint16Array(64)
    for (const i of [0, 5, 17, 33, 48]) cells[i] = 1
    for (const i of [9, 24, 40, 63]) cells[i] = 2
    state().importPixels({ cols: 8, rows: 8, palette: [RED, GREEN], cells })
  }

  it('dotted region-split import collapses per color; composite and SVG stay identical', () => {
    importDots()
    const before = state().doc
    expect(before.layers![0].children).toHaveLength(5)
    expect(before.layers![1].children).toHaveLength(4)
    // fuse off makes the pre-merge export explode into one path per dot
    const unfused = { ...before, fuseObjects: false }
    expect((buildSvg(unfused, { includeBg: false }).match(/<path/g) ?? []).length).toBe(9)

    state().mergeSameColors()
    const after = state().doc
    expect(allObjs(after.layers!)).toHaveLength(2)
    expect(after.layers![0].children).toHaveLength(1)
    expect(after.layers![1].children).toHaveLength(1)
    expect(Array.from(after.cells)).toEqual(Array.from(before.cells))
    // even with fuse off the export is now one path per color
    const svg = buildSvg({ ...after, fuseObjects: false }, { includeBg: false })
    expect((svg.match(/<path/g) ?? []).length).toBe(2)
  })

  it('the selection scopes the merge; the selection remaps to the merged object', () => {
    importDots()
    const red = allObjs(state().doc.layers!).filter((o) => o.cells.values().next().value === 1)
    state().selectElements([red[0].id, red[1].id, red[2].id])
    state().mergeSameColors()
    const doc = state().doc
    expect(doc.layers![0].children).toHaveLength(3)
    const merged = doc.layers![0].children[0] as SceneObj
    expect(merged.cells.size).toBe(3)
    expect(state().selection).toEqual([merged.id])
    // the unselected green layer is untouched
    expect(doc.layers![1].children).toHaveLength(4)
  })

  it('undo restores the split tree', async () => {
    importDots()
    // history pushes are throttled (350 ms): let each mutation land before the next step
    await wait(400)
    state().mergeSameColors()
    expect(allObjs(state().doc.layers!)).toHaveLength(2)
    await wait(400)
    undo()
    expect(allObjs(state().doc.layers!)).toHaveLength(9)
  })
})
