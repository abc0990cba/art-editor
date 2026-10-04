import { beforeEach, describe, expect, it } from 'vitest'

import { useStore } from '../../state/editor.store'
import { buildGeometry, PENDING_OBJ } from '../geometry/index.ts'
import { defaultDoc, type Doc } from './doc.ts'
import { deserialize, serialize } from './project.ts'
import {
  allObjs,
  ensureScene,
  findNode,
  groupObjs,
  reorderNode,
  syncDoc,
  ungroupAround,
  type SceneObj,
} from './scene.ts'

const pathSignatures = (doc: Doc) =>
  buildGeometry(doc)
    .paths.map((p) => `${p.fill}|${p.d}`)
    .sort()

const RED = '#ff0000'
const GREEN = '#00ff00'

/** Paint through the store's paintCells; returns the palette value the cells received. */
function stroke(cells: [number, number][], color = RED): number {
  const s = useStore.getState()
  const v =
    s.doc.palette.findIndex((c) => c.toLowerCase() === color.toLowerCase()) + 1 ||
    s.doc.palette.length + 1
  const bw = s.doc.cols * s.doc.sub
  const map = new Map<number, number | null>()
  for (const [x, y] of cells) map.set(y * bw + x, v)
  s.paintCells(map, color)
  return v
}

/** Object ids present in the composite, in first-appearance order. */
function compositeOwners(doc: Doc): number[] {
  const ids: number[] = []
  for (let i = 0; i < doc.cellObj!.length; i++) {
    const o = doc.cellObj![i]
    if (o > 0 && !ids.includes(o)) ids.push(o)
  }
  return ids
}

const cell = (doc: Doc, x: number, y: number) => y * doc.cols * doc.sub + x

describe('scene: composite and object identity', () => {
  beforeEach(() => {
    useStore.setState({ doc: ensureScene(defaultDoc()), selection: [], activeLayerId: null })
  })
  const state = () => useStore.getState()

  it('each stroke becomes its own object, even with identical styles', () => {
    stroke([
      [2, 2],
      [3, 2],
    ])
    stroke([
      [6, 2],
      [7, 2],
    ])
    const doc = state().doc
    expect(allObjs(doc.layers!)).toHaveLength(2)
    const [a, b] = compositeOwners(doc)
    expect(a).not.toBe(b)
  })

  it('layers are independent compositing spaces: covering never destroys the layer below', () => {
    const red = stroke([[2, 2]])
    state().addLayer()
    const green = stroke([[2, 2]])
    const doc = state().doc
    expect(doc.layers).toHaveLength(2)
    // the top layer wins the composite…
    expect(doc.layers![1].id).toBe(state().activeLayerId)
    expect(doc.cells[cell(doc, 2, 2)]).toBe(green)
    // …but the bottom object's ink is untouched — hiding the top layer reveals it
    const bottomId = compositeOwners(doc)[0]
    const bottom = findNode(doc.layers!, bottomId)!.item as SceneObj
    expect(bottom.cells.get(cell(doc, 2, 2))).toBe(red)
    const hidden = syncDoc({
      ...doc,
      layers: doc.layers!.map((l, i) => (i === 1 ? { ...l, visible: false } : l)),
    })
    expect(hidden.cells[cell(doc, 2, 2)]).toBe(red)
  })

  it('same-style objects on one layer fuse via metaball, across layers they never do', () => {
    state().setRenderMode('metaball')
    stroke([
      [2, 2],
      [3, 2],
    ])
    stroke([
      [5, 2],
      [6, 2],
    ])
    // same layer, fuseObjects on: one merged field
    const fused = state().doc
    expect(buildGeometry(fused).paths).toHaveLength(1)
    // move the second object onto a second layer: two isolated fields
    state().addLayer()
    const s2 = state()
    const bottom = s2.doc.layers![0]
    const moved = bottom.children[bottom.children.length - 1]
    const split = syncDoc({
      ...s2.doc,
      layers: [
        { ...bottom, children: bottom.children.slice(0, -1) },
        { ...s2.doc.layers![1], children: [moved] },
      ],
    })
    expect(buildGeometry(split).paths).toHaveLength(2)
    // fuseObjects off splits them even on one layer
    const unfused = syncDoc({ ...fused, fuseObjects: false })
    expect(buildGeometry(unfused).paths).toHaveLength(2)
  })

  it('groups render identically and ungroup restores the structure', () => {
    stroke([[1, 1]])
    stroke([[5, 5]])
    const ids = compositeOwners(state().doc)
    state().selectElements(ids)
    const s = useStore.getState()
    const res = groupObjs(s.doc.layers!, s.doc, new Set(s.selection))
    expect(res).not.toBeNull()
    const doc = syncDoc({ ...s.doc, layers: res!.layers })
    expect(doc.layers![0].children[0].kind).toBe('group')
    expect(allObjs(doc.layers!)).toHaveLength(2)
    expect(pathSignatures(doc)).toEqual(pathSignatures(s.doc))
    const ungrouped = syncDoc({
      ...doc,
      layers: ungroupAround(doc.layers!, new Set([res!.group.children[0].id])),
    })
    expect(ungrouped.layers![0].children.filter((c) => c.kind === 'group')).toHaveLength(0)
    expect(allObjs(ungrouped.layers!)).toHaveLength(2)
    expect(pathSignatures(ungrouped)).toEqual(pathSignatures(doc))
  })

  it('reorderNode changes stacking: the object moved below loses the composite cell', () => {
    const red = stroke([[2, 2]])
    state().addLayer()
    const green = stroke([[2, 2]])
    const doc = state().doc
    expect(doc.cells[cell(doc, 2, 2)]).toBe(green)
    const bottomObjId = compositeOwners(doc)[0]
    const topObjId = compositeOwners(doc)[1]
    const reordered = reorderNode(doc.layers!, topObjId, bottomObjId, 'before')
    const after = syncDoc({ ...doc, layers: reordered! })
    expect(after.cells[cell(after, 2, 2)]).toBe(red)
  })
})

describe('scene: transforms and persistence', () => {
  beforeEach(() => {
    useStore.setState({ doc: ensureScene(defaultDoc()), selection: [], activeLayerId: null })
  })
  const state = () => useStore.getState()

  it('setSize carries object cells along', () => {
    const red = stroke([
      [2, 2],
      [3, 2],
    ])
    const objId = compositeOwners(useStore.getState().doc)[0]
    const s = useStore.getState()
    s.setSize(s.doc.cols + 4, s.doc.rows + 3)
    const doc = useStore.getState().doc
    const nbw = doc.cols * doc.sub
    expect(doc.cells[2 * nbw + 2]).toBe(red)
    expect(doc.cellObj![2 * nbw + 2]).toBe(objId)
    expect(allObjs(doc.layers!)[0].cells.has(2 * nbw + 3)).toBe(true)
  })

  it('setSub resamples object cells nearest-neighbor', () => {
    const red = stroke([[2, 2]])
    state().setSub(2)
    const doc = state().doc
    const sbw = doc.cols * 2
    expect(doc.cells[4 * sbw + 4]).toBe(red)
    // the whole 2×2 block of the upsampled pixel joins the same object
    expect(allObjs(doc.layers!)[0].cells.has(5 * sbw + 5)).toBe(true)
  })

  it('serialize/deserialize round-trips the scene tree and renders identically', () => {
    stroke([
      [2, 2],
      [3, 2],
    ])
    state().addLayer()
    stroke([[8, 8]], GREEN)
    const doc = state().doc
    const restored = deserialize(JSON.parse(JSON.stringify(serialize(doc))))
    expect(restored.layers).not.toBeNull()
    expect(allObjs(restored.layers!)).toHaveLength(2)
    expect(pathSignatures(restored)).toEqual(pathSignatures(doc))
    expect(Array.from(restored.cells)).toEqual(Array.from(doc.cells))
    expect(Array.from(restored.cellObj!)).toEqual(Array.from(doc.cellObj!))
  })

  it('importPixels splits the converted result into one layer per distinct color', () => {
    useStore
      .getState()
      .patchImportLayering({ splitByColor: true, splitConnected: false, layerOrder: 'area' })
    const cells = new Uint16Array(16)
    cells[0] = 1
    cells[1] = 1
    cells[2] = 2
    cells[3] = 1
    useStore.getState().importPixels({
      cols: 4,
      rows: 4,
      palette: ['#111111', '#222222'],
      cells,
    })
    const doc = useStore.getState().doc
    // two final colors → two layers, largest area at the bottom, named by the hex
    expect(doc.layers).toHaveLength(2)
    const [bottom, top] = doc.layers!
    expect(bottom.name).toBe('#111111')
    expect((bottom.children[0] as SceneObj).cells.size).toBe(3)
    expect(top.name).toBe('#222222')
    expect((top.children[0] as SceneObj).cells.size).toBe(1)
    // composite holds the full picture; the active layer is the topmost one
    expect(doc.cells[0]).toBe(1)
    expect(doc.cells[2]).toBe(2)
    expect(useStore.getState().activeLayerId).toBe(top.id)
    // hiding a color layer removes exactly that color from the composite
    const hidden = syncDoc({
      ...doc,
      layers: doc.layers!.map((l, i) => (i === 1 ? { ...l, visible: false } : l)),
    })
    expect(hidden.cells[2]).toBe(0)
    expect(hidden.cells[0]).toBe(1)
  })

  it('import layering: connected regions, single layer, palette order', () => {
    const s = useStore.getState()
    s.patchImportLayering({ splitByColor: true, splitConnected: true, layerOrder: 'palette' })
    // value 2: one 2×2 block; value 1: two disconnected single cells
    const cells = new Uint16Array(16)
    cells[0] = 2
    cells[1] = 2
    cells[4] = 2
    cells[5] = 2
    cells[10] = 1
    cells[15] = 1
    s.importPixels({ cols: 4, rows: 4, palette: ['#111111', '#222222'], cells })
    const doc = state().doc
    // palette order puts #111111 below #222222
    expect(doc.layers!.map((l) => l.name)).toEqual(['#111111', '#222222'])
    // value 1 → two disconnected single-cell objects; value 2 → one connected object
    expect(doc.layers![0].children).toHaveLength(2)
    expect(doc.layers![1].children).toHaveLength(1)

    // single-layer mode: one layer, one object per color
    s.patchImportLayering({ splitByColor: false, splitConnected: false })
    s.importPixels({ cols: 4, rows: 4, palette: ['#111111', '#222222'], cells })
    const doc2 = state().doc
    expect(doc2.layers).toHaveLength(1)
    expect(doc2.layers![0].children).toHaveLength(2)
    expect(doc2.cells[0]).toBe(2)

    // single layer + connected: every region of any color is its own object
    s.patchImportLayering({ splitByColor: false, splitConnected: true })
    s.importPixels({ cols: 4, rows: 4, palette: ['#111111', '#222222'], cells })
    const doc3 = state().doc
    expect(doc3.layers).toHaveLength(1)
    expect(doc3.layers![0].children).toHaveLength(3)
    // restore defaults for later tests
    s.patchImportLayering({ splitByColor: true, splitConnected: false, layerOrder: 'area' })
  })

  it('v2 element projects migrate into the scene and keep rendering', () => {
    const base = defaultDoc()
    const cells = new Uint16Array(64)
    const cellObj = new Uint32Array(64)
    cells[1 * 8 + 2] = 1
    cellObj[1 * 8 + 2] = 1
    cells[6 * 8 + 6] = 2
    cellObj[6 * 8 + 6] = 1
    cells[0] = 3
    // cellObj 0 = painted but unattributed → its own bottom object after migration
    const flat: Doc = {
      ...base,
      cols: 8,
      rows: 8,
      cells,
      cellObj,
      elements: [
        {
          style: base.style,
          renderMode: base.renderMode,
          connectivity: base.connectivity,
          metaball: base.metaball,
          texture: base.texture,
          extrude: base.extrude,
        },
      ],
    }
    const migrated = ensureScene(flat)
    expect(migrated.layers).not.toBeNull()
    expect(allObjs(migrated.layers!)).toHaveLength(2)
    const restored = deserialize(JSON.parse(JSON.stringify(serialize(migrated))))
    expect(pathSignatures(restored)).toEqual(pathSignatures(migrated))
    expect(Array.from(restored.cellObj!)).toEqual(Array.from(migrated.cellObj!))
  })
})

describe('scene: store editing', () => {
  beforeEach(() => {
    useStore.setState({ doc: ensureScene(defaultDoc()), selection: [], activeLayerId: null })
  })
  const state = () => useStore.getState()

  it('deleteSelection removes the object and its ink', () => {
    stroke([[2, 2]])
    const id = compositeOwners(state().doc)[0]
    state().selectElements([id])
    state().deleteSelection()
    const doc = state().doc
    expect(doc.cells[cell(doc, 2, 2)]).toBe(0)
    expect(allObjs(doc.layers!)).toHaveLength(0)
  })

  it('moveSelection translates object cells; attached connectors follow', () => {
    const red = stroke([
      [0, 0],
      [1, 0],
    ])
    state().addLinks([{ ax: 0, ay: 0, bx: 1, by: 0, v: 0 }], RED)
    const id = compositeOwners(useStore.getState().doc)[0]
    state().selectElements([id])
    state().moveSelection(2, 1)
    const doc = useStore.getState().doc
    const bw = doc.cols * doc.sub
    expect(doc.cells[1 * bw + 2]).toBe(red)
    const obj = allObjs(doc.layers!).find((o) => o.id === id)!
    expect(obj.cells.get(1 * bw + 3)).toBe(red)
    // the connector lived on its own object but rides along with the moved pixels
    expect(doc.links[0]).toMatchObject({ ax: 2, ay: 1, bx: 3, by: 1 })
  })

  it('painting into a hidden active layer is dropped', () => {
    stroke([[2, 2]])
    const s = useStore.getState()
    s.addLayer()
    // hide the (now active) top layer
    const withHidden = useStore.getState()
    useStore.setState({
      doc: {
        ...withHidden.doc,
        layers: withHidden.doc.layers!.map((l, i) => (i === 1 ? { ...l, visible: false } : l)),
      },
    })
    const before = Array.from(useStore.getState().doc.cells)
    stroke([[5, 5]], GREEN)
    const doc = useStore.getState().doc
    expect(Array.from(doc.cells)).toEqual(before)
    expect(allObjs(doc.layers!)).toHaveLength(1)
  })

  it('staged ink without a layer tag previews on the topmost layer', () => {
    stroke([[2, 2]])
    const doc = state().doc
    const st = {
      cells: new Map<number, number | null>([
        [5, 1],
        [cell(doc, 2, 2), null],
      ]),
      objs: new Map<number, number | null>([[5, PENDING_OBJ]]),
    }
    const paths = buildGeometry(doc, st).paths
    expect(paths.length).toBeGreaterThan(0)
  })

  it('object graphs evaluate into the composite, override style and round-trip', () => {
    const red = stroke([[0, 0]])
    const id = compositeOwners(useStore.getState().doc)[0]
    // the graph is the recipe: the ellipse replaces the stored ink, the color joins the palette
    useStore.getState().setObjectGraph(id, {
      graphVersion: 1,
      nodes: [
        {
          id: 'n1',
          op: 'source.ellipse',
          params: { cx: 8, cy: 8, rx: 3, ry: 3, color: '#00ff00' },
        },
      ],
    })
    const doc = useStore.getState().doc
    const green = doc.palette.findIndex((c) => c === '#00ff00') + 1
    // a graph with a source node is fully procedural: the stored ink is ignored
    expect(doc.cells[0]).toBe(0)
    expect(green).toBeGreaterThan(0)
    expect(doc.cells[8 * doc.cols + 8]).toBe(green)
    expect(doc.cellObj![8 * doc.cols + 8]).toBe(id)

    // style nodes override the evaluated appearance
    useStore.getState().setObjectGraph(id, {
      graphVersion: 1,
      nodes: [
        { id: 'n1', op: 'style.render', params: { renderMode: 'metaball', connectivity: 'edge' } },
      ],
    })
    expect(useStore.getState().doc.elements[id - 1].renderMode).toBe('metaball')

    // removing the graph restores the stored ink and the base style
    useStore.getState().setObjectGraph(id, null)
    expect(useStore.getState().doc.cells[0]).toBe(red)
    expect(useStore.getState().doc.elements[id - 1].renderMode).toBe('pixels')

    // the graph survives serialization
    useStore.getState().setObjectGraph(id, {
      graphVersion: 1,
      nodes: [{ id: 'n1', op: 'source.rect', params: { x: 0, y: 0, w: 2, h: 2 } }],
    })
    const restored = deserialize(JSON.parse(JSON.stringify(serialize(useStore.getState().doc))))
    expect(pathSignatures(restored)).toEqual(pathSignatures(useStore.getState().doc))
    expect(restored.layers![0].children.some((c) => c.kind === 'obj' && c.graph)).toBe(true)
  })
})
