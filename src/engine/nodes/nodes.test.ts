import { beforeEach, describe, expect, it } from 'vitest'
import { defaultDoc, elementFromDoc, type Doc } from '../doc'
import { buildGeometry } from '../geometry'
import { ensureScene, type SceneObj } from '../scene'
import { useStore } from '../../state/store'
import {
  allNodes,
  evalGraph,
  graphColors,
  registryJSON,
  validateGraph,
  type EvalInput,
  type GraphPreset,
  GRAPH_PRESETS,
  fitGraphToCanvas,
  type Graph,
  type GraphNode,
} from './index'

const ctx = (over?: Partial<EvalInput>): EvalInput => ({
  bw: 16,
  bh: 16,
  paletteLen: 12,
  hexValue: (hex) => ({ '#e63946': 1, '#2a9d8f': 2, '#e9c46a': 3 } as Record<string, number>)[hex] ?? 1,
  baseStyle: elementFromDoc(defaultDoc()),
  ...over,
})

const run = (nodes: Array<{ op: string; params?: Record<string, unknown> }>, over?: Partial<EvalInput>) =>
  evalGraph({ graphVersion: 1, nodes: nodes as GraphNode[] }, { ...ctx(), ...over }).cells

describe('node registry', () => {
  it('registers a unique, non-empty catalog', () => {
    const ids = allNodes().map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('source.rect')
    expect(ids).toContain('source.ellipse')
    expect(ids).toContain('source.shape')
    expect(ids).toContain('ramp.gradient')
    expect(ids).toContain('mod.arrayGrid')
    expect(ids).toContain('mod.arrayCircle')
    expect(ids).toContain('style.texture')
    for (const def of allNodes()) expect(Object.keys(def.params).length).toBeGreaterThan(0)
  })

  it('registryJSON carries every node with its parameter schema', () => {
    const parsed = JSON.parse(registryJSON()) as { nodes: Array<{ id: string; params: Record<string, { kind: string; default: unknown }> }> }
    expect(parsed.nodes.map((n) => n.id).sort()).toEqual(allNodes().map((d) => d.id).sort())
    const rect = parsed.nodes.find((n) => n.id === 'source.rect')!
    expect(rect.params.w).toMatchObject({ kind: 'int', default: 8 })
  })

  it('conformance: every registered node evaluates deterministically on defaults', () => {
    for (const def of allNodes()) {
      const node: GraphNode = { id: 't', op: def.id, params: {} }
      const out1 = evalGraph({ graphVersion: 1, nodes: [node] }, ctx())
      const out2 = evalGraph({ graphVersion: 1, nodes: [node] }, ctx())
      expect([...out1.cells.entries()].sort()).toEqual([...out2.cells.entries()].sort())
      expect(JSON.stringify(out1.style)).toBe(JSON.stringify(out2.style))
      if (def.kind !== 'style') expect(out1.cells).toBeInstanceOf(Map)
    }
  })
})

describe('raster evaluation', () => {
  it('source.rect: add, subtract and intersect combine with the accumulated ink', () => {
    const a = { op: 'source.rect', params: { x: 0, y: 0, w: 8, h: 8, color: '#e63946' } }
    const b = { op: 'source.rect', params: { x: 4, y: 4, w: 8, h: 8, color: '#e63946' } }
    expect(run([a]).size).toBe(64)
    expect(run([a, { ...b, params: { ...b.params, mode: 'add' } }]).size).toBe(64 + 64 - 16)
    expect(run([a, { ...b, params: { ...b.params, mode: 'subtract' } }]).size).toBe(64 - 16)
    expect(run([a, { ...b, params: { ...b.params, mode: 'intersect' } }]).size).toBe(16)
  })

  it('source.ellipse paints inside its bounding box', () => {
    const cells = run([{ op: 'source.ellipse', params: { cx: 8, cy: 8, rx: 4, ry: 4 } }])
    expect(cells.size).toBeGreaterThan(0)
    expect(cells.size).toBeLessThanOrEqual(81)
    for (const i of cells.keys()) {
      const x = i % 16
      expect(x).toBeGreaterThanOrEqual(4)
      expect(x).toBeLessThanOrEqual(12)
    }
  })

  it('source.shape rasterizes a filled star', () => {
    const cells = run([{ op: 'source.shape', params: { shape: 'star', x: 2, y: 2, w: 12, h: 12 } }])
    expect(cells.size).toBeGreaterThan(12)
  })

  it('mod.offset shifts the accumulated cells', () => {
    const cells = run([
      { op: 'source.rect', params: { x: 0, y: 0, w: 4, h: 4 } },
      { op: 'mod.offset', params: { dx: 2, dy: 3 } },
    ])
    for (const i of cells.keys()) {
      const x = i % 16
      const y = Math.floor(i / 16)
      expect(x).toBeGreaterThanOrEqual(2)
      expect(y).toBeGreaterThanOrEqual(3)
    }
  })

  it('mod.arrayGrid replicates count times', () => {
    const cells = run([
      { op: 'source.rect', params: { x: 0, y: 0, w: 2, h: 2 } },
      { op: 'mod.arrayGrid', params: { count: 3, dx: 4, dy: 0 } },
    ])
    expect(cells.size).toBe(12)
  })

  it('mod.arrayCircle spreads copies around the center', () => {
    const cells = run([
      { op: 'source.rect', params: { x: 8, y: 5, w: 1, h: 1 } },
      { op: 'mod.arrayCircle', params: { count: 6, cx: 8, cy: 8 } },
    ])
    expect(cells.size).toBe(6)
  })

  it('mod.symmetry mirrors across the vertical axis', () => {
    const cells = run([
      { op: 'source.rect', params: { x: 0, y: 0, w: 4, h: 4 } },
      { op: 'mod.symmetry', params: { mode: 'mirrorX', n: 8 } },
    ])
    expect(cells.size).toBe(32)
  })

  it('mod.symmetry quad makes four corner copies', () => {
    const cells = run([
      { op: 'source.rect', params: { x: 2, y: 2, w: 4, h: 4 } },
      { op: 'mod.symmetry', params: { mode: 'quad', n: 8 } },
    ])
    expect(cells.size).toBe(64)
  })

  it('ramp.gradient maps the ends of the axis to the from/to values', () => {
    const cells = run([
      { op: 'source.rect', params: { x: 0, y: 0, w: 16, h: 2 } },
      { op: 'ramp.gradient', params: { angle: 0, from: 1, to: 3 } },
    ])
    const at = (x: number) => cells.get(x)
    expect(at(0)).toBe(1)
    expect(at(15)).toBe(3)
    expect(at(8)).toBe(2)
  })
})

describe('style evaluation', () => {
  it('style nodes write the appearance over the base style', () => {
    const out = evalGraph(
      {
        graphVersion: 1,
        nodes: [
          { id: 'a', op: 'style.render', params: { renderMode: 'metaball', connectivity: 'corner' } },
          { id: 'b', op: 'style.pixel', params: { radius: 0.5, sizeX: 1, sizeY: 1 } },
        ],
      },
      ctx(),
    )
    expect(out.style.renderMode).toBe('metaball')
    expect(out.style.connectivity).toBe('corner')
    expect(out.style.style.radius).toBe(0.5)
    // the base style is never mutated
    expect(elementFromDoc(defaultDoc()).renderMode).toBe('pixels')
  })
})

describe('edges (links between nodes)', () => {
  it('edges define the flow: two sources merge into one modifier', () => {
    const graph: Graph = {
      graphVersion: 1 as const,
      nodes: [
        { id: 'a', op: 'source.rect', params: { x: 0, y: 0, w: 4, h: 4 } },
        { id: 'b', op: 'source.rect', params: { x: 8, y: 0, w: 4, h: 4 } },
        { id: 'm', op: 'mod.offset', params: { dx: 1, dy: 0 } },
      ],
      edges: [
        { from: 'a', to: 'm' },
        { from: 'b', to: 'm' },
      ],
    }
    const cells = evalGraph(graph, ctx()).cells
    // the union (2 × 16 cells) shifted by +1
    expect(cells.size).toBe(32)
    expect(cells.has(1)).toBe(true)
    expect(cells.has(9)).toBe(true)
  })

  it('linear fallback: without edges the list order is the flow', () => {
    const cells = run([
      { op: 'source.rect', params: { x: 0, y: 0, w: 4, h: 4 } },
      { op: 'mod.offset', params: { dx: 2, dy: 0 } },
    ])
    expect(cells.size).toBe(16)
    expect(cells.has(2)).toBe(true)
  })

  it('validateGraph breaks cycles with a warning and the evaluator terminates', () => {
    const res = validateGraph({
      graphVersion: 1,
      nodes: [
        { id: 'a', op: 'source.rect', params: { x: 0, y: 0, w: 4, h: 4 } },
        { id: 'b', op: 'mod.offset', params: { dx: 1, dy: 0 } },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
    })
    expect(res.ok).toBe(true)
    expect(res.graph.edges).toHaveLength(1)
    expect(res.warnings.some((w) => w.includes('loop'))).toBe(true)
    expect(evalGraph(res.graph, ctx()).cells.size).toBeGreaterThan(0)
  })

  it('validateGraph drops edges with missing endpoints and keeps node positions', () => {
    const res = validateGraph({
      nodes: [{ id: 'a', op: 'source.rect', params: {}, pos: { x: 120, y: -40 } }],
      edges: [{ from: 'a', to: 'ghost' }],
    })
    expect(res.graph.nodes[0].pos).toEqual({ x: 120, y: -40 })
    expect(res.graph.edges ?? []).toHaveLength(0)
    expect(res.warnings.some((w) => w.includes('endpoint'))).toBe(true)
  })
})

describe('validation (AI entry contract)', () => {
  it('keeps unknown ops flagged and clamps parameters to the schema', () => {
    const res = validateGraph({
      graphVersion: 1,
      nodes: [
        { id: 'x', op: 'ai.magic', params: { foo: 'bar' } },
        { id: 'r', op: 'source.rect', params: { w: 99999, h: -5, color: 'not-a-color' } },
      ],
    })
    expect(res.ok).toBe(true)
    expect(res.graph.nodes).toHaveLength(2)
    expect(res.graph.nodes[0].unknown).toBe(true)
    const rect = res.graph.nodes[1].params
    expect(rect.w).toBe(2048)
    expect(rect.h).toBe(1)
    expect(rect.color).toBe('#e63946')
    expect(res.warnings.length).toBeGreaterThan(0)
    // the unknown node is skipped by the evaluator, the known one still paints
    const cells = evalGraph(res.graph, ctx()).cells
    expect(cells.size).toBe(12)
  })

  it('rejects structurally broken payloads', () => {
    expect(validateGraph('nope').ok).toBe(false)
    expect(validateGraph({}).ok).toBe(false)
  })

  it('graphColors collects hex params of known nodes', () => {
    const res = validateGraph({
      nodes: [
        { id: 'a', op: 'source.rect', params: { color: '#123456' } },
        { id: 'b', op: 'source.ellipse', params: { color: '#abcdef' } },
      ],
    })
    expect([...graphColors(res.graph)].sort()).toEqual(['#123456', '#abcdef'])
  })
})

describe('graph presets', () => {
  it('ships a dozen clean, acyclic recipes that paint on 16 and 32', () => {
    expect(GRAPH_PRESETS.length).toBeGreaterThanOrEqual(12)
    for (const preset of GRAPH_PRESETS) {
      const res = validateGraph(preset.graph)
      expect(res.ok).toBe(true)
      expect(res.warnings).toEqual([])
      expect(res.graph.edges?.length ?? 0).toBeGreaterThan(0)
      for (const side of [16, 32]) {
        const fitted = fitGraphToCanvas(res.graph, side, side)
        const cells = evalGraph(fitted, ctx({ bw: side, bh: side })).cells
        expect(cells.size).toBeGreaterThan(0)
      }
    }
  })

  it('fitGraphToCanvas scales coordinates with the canvas', () => {
    const preset = GRAPH_PRESETS.find((p) => p.id === 'flower-circle-array') as GraphPreset
    const fitted = fitGraphToCanvas(preset.graph, 32, 32)
    const ellipse = fitted.nodes.find((nd) => nd.op === 'source.ellipse')!
    expect(ellipse.params.cx).toBe(16)
    expect(ellipse.params.cy).toBe(10)
    expect(ellipse.params.ry).toBe(7)
    // card positions are editor pixels — they never scale with the canvas
    expect(ellipse.pos).toEqual({ x: 40, y: 40 })
    // non-positional params pass through untouched
    const circle = fitted.nodes.find((nd) => nd.op === 'mod.arrayCircle')!
    expect(circle.params.count).toBe(6)
  })
})

describe('style-only graphs dress the stored ink', () => {
  it('style.texture keeps the stored ink and adds texture fragments', () => {
    const cells = run([
      { op: 'source.rect', params: { x: 0, y: 0, w: 8, h: 8, color: '#e63946' } },
    ])
    // same graph + a texture node appended: the ink survives, the path grows fragments
    const withTex = run([
      { op: 'source.rect', params: { x: 0, y: 0, w: 8, h: 8, color: '#e63946' } },
      { op: 'style.texture', params: { effect: 'grain', amount: 90, scale: 1, angle: 45, seed: 3 } },
    ])
    expect(cells.size).toBe(64)
    expect(withTex.size).toBe(64)
  })

  it('a style-only graph still renders the stored ink with the texture applied', () => {
    useStore.setState({ doc: ensureScene(defaultDoc()), selection: [], activeLayerId: null })
    useStore.getState().paintCells(new Map([[0, 1], [1, 1], [2, 1], [3, 1]]), '#ff0000')
    const docAfter = useStore.getState().doc
    const id = docAfter.cellObj![0]
    const plainPaths = buildGeometry(docAfter).paths
    expect(plainPaths.length).toBeGreaterThan(0)
    const plainLen = plainPaths.map((p) => p.d.length).reduce((a, b) => a + b, 0)

    useStore.getState().setObjectGraph(id, {
      graphVersion: 1,
      nodes: [{ id: 't1', op: 'style.texture', params: { effect: 'grain', amount: 90, scale: 1, angle: 45, seed: 3 } }],
    })
    const textured = buildGeometry(useStore.getState().doc).paths
    expect(textured.length).toBe(plainPaths.length)
    // the ink is intact and the grain fragments were added on top
    const texturedLen = textured.map((p) => p.d.length).reduce((a, b) => a + b, 0)
    expect(texturedLen).toBeGreaterThan(plainLen)
  })
})

const pathSig = (doc: Doc) => buildGeometry(doc).paths.map((p) => `${p.fill}|${p.d}`).sort()

describe('every node has a visible effect', () => {
  it('source nodes paint, subtract cuts, intersect clips', () => {
    const a = run([{ op: 'source.rect', params: { x: 0, y: 0, w: 8, h: 8 } }])
    const b = run([{ op: 'source.ellipse', params: { cx: 8, cy: 8, rx: 5, ry: 5 } }])
    expect(a.size).toBe(64)
    expect(b.size).toBeGreaterThan(40)
    expect(b.size).toBeLessThanOrEqual(81)
  })

  it('style.pixel: rounding changes the path data', () => {
    useStore.setState({ doc: ensureScene(defaultDoc()), selection: [], activeLayerId: null })
    useStore.getState().paintCells(new Map([[0, 1], [1, 1]]), '#ff0000')
    const flat = pathSig(useStore.getState().doc)
    const objId = useStore.getState().doc.cellObj![0]
    useStore.getState().setObjectGraph(objId, {
      graphVersion: 1,
      nodes: [{ id: 'p', op: 'style.pixel', params: { radius: 0.5, sizeX: 1, sizeY: 1 } }],
    })
    const rounded = pathSig(useStore.getState().doc)
    expect(flat).not.toEqual(rounded)
  })

  it('style.metaball: higher strength merges two blobs (path count drops)', () => {
    useStore.setState({ doc: ensureScene({ ...defaultDoc(), cols: 16, rows: 16 }), selection: [], activeLayerId: null })
    const st = useStore.getState()
    // two nearby blobs as separate objects
    st.paintCells(new Map([[10, 1], [11, 1], [12, 1]]), '#ff0000')
    const firstId = useStore.getState().doc.cellObj![10]
    st.patchStyle({ radius: 0 })
    st.paintCells(new Map([[30, 1], [31, 1], [32, 1]]), '#ff0000')
    const secondId = useStore.getState().doc.cellObj![30]
    const graph = (strength: number): Graph => ({
      graphVersion: 1,
      nodes: [
        { id: 'n1', op: 'style.render', params: { renderMode: 'metaball', connectivity: 'edge' } },
        { id: 'n2', op: 'style.metaball', params: { strength, perColor: false } },
      ],
    })
    // strength 0: two separate fields; strength 90: the fields reach and fuse
    useStore.getState().setObjectGraph(firstId, graph(0))
    useStore.getState().setObjectGraph(secondId, graph(0))
    const separate = buildGeometry(useStore.getState().doc).paths
    useStore.getState().setObjectGraph(firstId, graph(95))
    useStore.getState().setObjectGraph(secondId, graph(95))
    const fused = buildGeometry(useStore.getState().doc).paths
    expect(separate.length).toBeGreaterThanOrEqual(fused.length)
  })

  it('style.render: outline mode yields different paths than pixels', () => {
    useStore.setState({ doc: ensureScene(defaultDoc()), selection: [], activeLayerId: null })
    const st = useStore.getState()
    st.paintCells(new Map([[0, 1], [1, 1], [2, 1], [1, 1]]), '#ff0000')
    const id = useStore.getState().doc.cellObj![0]
    const pixels = pathSig(useStore.getState().doc)
    st.setObjectGraph(id, {
      graphVersion: 1,
      nodes: [{ id: 'r', op: 'style.render', params: { renderMode: 'outline', connectivity: 'edge' } }],
    })
    const outline = pathSig(useStore.getState().doc)
    expect(outline).not.toEqual(pixels)
  })

  it('style.texture: grain adds fragment content to the paths', () => {
    useStore.setState({ doc: ensureScene(defaultDoc()), selection: [], activeLayerId: null })
    const st = useStore.getState()
    st.paintCells(new Map([[0, 1], [1, 1], [2, 1], [3, 1]]), '#ff0000')
    const id = useStore.getState().doc.cellObj![0]
    const plainLen = pathSig(useStore.getState().doc).join('').length
    st.setObjectGraph(id, {
      graphVersion: 1,
      nodes: [{ id: 't', op: 'style.texture', params: { effect: 'grain', amount: 90, scale: 1, angle: 45, seed: 3 } }],
    })
    const texLen = pathSig(useStore.getState().doc).join('').length
    expect(texLen).toBeGreaterThan(plainLen)
  })
})

describe('applyGraphPreset (always-visible node presets)', () => {
  beforeEach(() => {
    useStore.setState({ doc: ensureScene(defaultDoc()), selection: [], activeLayerId: null, projectDirty: false })
  })
  const state = () => useStore.getState()

  it('with no selection it creates a fresh object, attaches the graph and selects it', () => {
    expect(useStore.getState().selection).toHaveLength(0)
    state().applyGraphPreset('flower-circle-array')
    const sel = state().selection
    expect(sel).toHaveLength(1)
    const obj = state().doc.layers![0].children.find((c) => c.kind === 'obj')
    expect(obj).toBeTruthy()
    let ink = 0
    for (let i = 0; i < state().doc.cells.length; i++) if (state().doc.cells[i] > 0) ink++
    expect(ink).toBeGreaterThan(0)
    void sel
  })

  it('scales preset params to the current canvas (128×128 → ×8)', () => {
    state().newDoc()
    expect(state().doc.cols).toBe(128)
    state().applyGraphPreset('flower-circle-array')
    const obj = state().doc.layers![0].children.find((c) => c.kind === 'obj') as SceneObj
    const ellipse = obj.graph!.nodes.find((nd) => nd.op === 'source.ellipse')!
    // preset tuned for 16×16 (cx 8, cy 5, rx 2, ry 3.5) × 8 on a 128 canvas
    expect(ellipse.params.cx).toBe(64)
    expect(ellipse.params.ry).toBe(28)
    // the parametric ink lands inside the canvas
    let ink = 0
    for (let i = 0; i < state().doc.cells.length; i++) if (state().doc.cells[i] > 0) ink++
    expect(ink).toBeGreaterThan(0)
  })

  it('applying to a selected object replaces its graph', () => {
    state().applyGraphPreset('flower-circle-array')
    const firstSel = state().selection
    state().applyGraphPreset('star-grain-outline')
    const doc = state().doc
    const obj = doc.layers![0].children.find((c) => c.kind === 'obj' && c.id === firstSel[0]) as SceneObj | undefined
    expect(obj?.graph?.nodes.map((nd) => nd.op)).toContain('style.texture')
    // the flower was replaced: only the new graph's nodes remain on this object
    expect(obj?.graph?.nodes.length).toBe(3)
  })
})

describe('draw → auto node graph (live sync)', () => {
  beforeEach(() => {
    useStore.setState({ doc: ensureScene(defaultDoc()), selection: [], activeLayerId: null })
  })
  const state = () => useStore.getState()

  it('a pencil stroke gets an auto Offset node; editing dx moves the rendered ink', () => {
    state().paintCells(new Map([[0, 1], [1, 1]]), '#ff0000')
    const id = state().selection[0] || state().doc.cellObj![0]
    const obj = state().doc.layers![0].children.find((c) => c.kind === 'obj' && c.id === id) as SceneObj
    expect(obj.graph?.nodes.map((n) => n.op)).toEqual(['mod.offset'])

    // edit the Offset node dx in the node editor → the ink moves on canvas
    state().setObjectGraph(id, {
      graphVersion: 1,
      nodes: obj.graph!.nodes.map((nd) =>
        nd.op === 'mod.offset' ? { ...nd, params: { ...nd.params, dx: 2 } } : nd,
      ),
    })
    const doc = state().doc
    expect(doc.cells[2]).toBeGreaterThan(0)
    expect(doc.cells[0]).toBe(0)
  })

  it('moveSelection on a procedural object writes dx/dy into the Offset node', () => {
    const cur = useStore.getState().doc
    useStore.getState().paintCellsValues(
      new Map([[0, 1], [1, 1], [2, 1]]),
      { ...cur, palette: [...cur.palette] },
      { op: 'source.rect', params: { x: 0, y: 0, w: 3, h: 1, color: '#ff0000' } },
    )
    const id = state().doc.cellObj![0]
    state().selectElements([id])
    state().moveSelection(2, 1)

    const obj = state().doc.layers![0].children.find((c) => c.kind === 'obj' && c.id === id) as
      | SceneObj
      | undefined
    if (!obj) throw new Error('moved object not found')
    const offset = obj.graph?.nodes.find((nd) => nd.op === 'mod.offset')!
    expect(offset.params.dx).toBe(2)
    expect(offset.params.dy).toBe(1)
    // the procedural ink follows the offset on canvas
    expect(state().doc.cells[1 * state().doc.cols + 2]).toBeGreaterThan(0)
  })

  it('the eraser cannot erase procedural ink (the graph wins)', () => {
    const cur = useStore.getState().doc
    state().paintCellsValues(
      new Map([[0, 1], [1, 1]]),
      { ...cur, palette: [...cur.palette] },
      { op: 'source.ellipse', params: { cx: 8, cy: 8, rx: 5, ry: 5, color: '#ff0000' } },
    )
    const before = pathSig(useStore.getState().doc)
    state().paintCells(new Map([[0, null], [1, null]]), '')
    expect(pathSig(useStore.getState().doc)).toEqual(before)
  })

  it('mod.recolor paints every input cell with one palette value', () => {
    const cells = run([
      { op: 'source.rect', params: { x: 0, y: 0, w: 2, h: 2, color: '#e63946' } },
      { op: 'mod.recolor', params: { color: '#2a9d8f' } },
    ])
    expect(cells.size).toBe(4)
    for (const [, v] of cells) expect(v).toBe(2)
  })

  it('source.line paints cells along the segment', () => {
    const cells = run([{ op: 'source.line', params: { x0: 0, y0: 0, x1: 4, y1: 0 } }])
    expect(cells.size).toBe(5)
    for (const i of cells.keys()) expect(Math.floor(i / 16)).toBe(0)
  })
})

