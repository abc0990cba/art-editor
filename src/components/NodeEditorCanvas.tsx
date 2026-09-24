import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { useI18n } from '../i18n'
import {
  GRAPH_PRESETS,
  fitGraphToCanvas,
  evalGraphStages,
  evaluatedStyleFor,
  allNodes,
  emptyGraph,
  nodeDef,
  registryJSON,
  validateGraph,
  type AnyNodeDef,
  type Graph,
  type GraphNode,
  type NodeKind,
  type Cells,

  type NodeParamSpec,
  DOMAIN_STYLE,
} from '../engine/nodes'
import { elementFromDoc } from '../engine/doc'
import type { SceneObj } from '../engine/scene'
import { CellsPreview, StyleSamplePreview } from './NodePreview'
import { DragNumber } from './DragNumber'
import { boundsWithValue, paramBounds } from '../engine/nodes'
import { Chip } from './ui'
import { Tooltip } from './Tooltip'
import { download } from './fileDownload'

/** Card metrics in editor-world px (the canvas transform scales them). */
const CARD_W = 190
const SOCKET_Y = 22

const KIND_DOT: Record<NodeKind, string> = {
  source: 'bg-sky-400',
  mod: 'bg-amber-400',
  ramp: 'bg-fuchsia-400',
  style: 'bg-emerald-400',
}

interface WireDrag {
  fromId: string
  x: number
  y: number
}

/**
 * The dedicated node-editor space (Blender-style): a full-area overlay with a pannable,
 * zoomable canvas of node cards linked by wires. Edits write through `setObjectGraph`,
 * so undo, autosave and serialization all behave like any other document edit.
 */
export function NodeEditorCanvas({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const doc = useStore((s) => s.doc)
  const selection = useStore((s) => s.selection)
  const setObjectGraph = useStore((s) => s.setObjectGraph)
  const nodeEditorMode = useStore((s) => s.nodeEditorMode)
  const setNodeEditorMode = useStore((s) => s.setNodeEditorMode)

  const [objId, setObjId] = useState<number | null>(null)
  const [pan, setPan] = useState({ x: 60, y: 50 })
  const [zoom, setZoom] = useState(1)
  // live mirrors for the touch-gesture effect (mounted once, reads at pinch start)
  const panRef = useRef(pan)
  const zoomRef = useRef(zoom)
  panRef.current = pan
  zoomRef.current = zoom
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null)
  const [wireDrag, setWireDrag] = useState<WireDrag | null>(null)
  const [addOp, setAddOp] = useState('')
  const [panMode, setPanMode] = useState(false)
  const [presetId, setPresetId] = useState('')
  const [importState, setImportState] = useState<{ error?: boolean; warnings?: string[] } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

  // drag/pan state lives in a ref: pointermove must not fight React batching
  const dragRef = useRef<
    | { kind: 'pan'; sx: number; sy: number; px: number; py: number }
    | { kind: 'node'; nodeId: string; sx: number; sy: number; px: number; py: number }
    | null
  >(null)

  // resolve the edited object: explicit choice → the single selection → the first graph owner
  const objects = useMemo(() => {
    if (!doc.layers) return []
    const out: Array<{ id: number; name: string; hasGraph: boolean; obj: SceneObj }> = []
    const walk = (items: import('../engine/scene').SceneItem[]): void => {
      for (const item of items) {
        if (item.kind === 'obj') {
          out.push({
            id: item.id,
            name: item.name || `${t('layers.defaultObject')} ${item.id}`,
            hasGraph: !!item.graph,
            obj: item,
          })
        } else walk(item.children)
      }
    }
    for (const layer of doc.layers) walk(layer.children)
    return out
  }, [doc.layers, t])

  const obj = useMemo(() => {
    if (objId != null) {
      const found = objects.find((o) => o.id === objId)
      if (found) return found
    }
    if (selection.length === 1) {
      const found = objects.find((o) => o.id === selection[0])
      if (found) return found
    }
    return objects.find((o) => o.hasGraph) ?? objects[0] ?? null
  }, [objects, objId, selection])

  const graph: Graph | null = obj?.obj.graph ?? null
  // graphs with a source node are procedural: the stored ink is ignored
  const procedural = !!graph?.nodes.some((n) => !n.unknown && nodeDef(n.op)?.kind === 'source')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) return
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && graph) {
        if (selectedEdge != null && graph.edges) {
          const edges = graph.edges.filter((_, i) => i !== selectedEdge)
          setObjectGraph(obj?.id ?? 0, { ...graph, edges })
          setSelectedEdge(null)
          e.preventDefault()
        } else if (selectedNodeId) {
          setObjectGraph(obj?.id ?? 0, {
            graphVersion: 1,
            nodes: graph.nodes.filter((n) => n.id !== selectedNodeId),
            edges: graph.edges?.filter((e) => e.from !== selectedNodeId && e.to !== selectedNodeId),
          })
          setSelectedNodeId(null)
          e.preventDefault()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [graph, selectedEdge, selectedNodeId, obj, onClose, setObjectGraph])

  const groups = useMemo(() => {
    const m = new Map<string, AnyNodeDef[]>()
    for (const def of allNodes()) {
      const arr = m.get(def.category) ?? []
      arr.push(def)
      m.set(def.category, arr)
    }
    return [...m.entries()]
  }, [])

  // content bounds in world px — drives the navigation scrollbars
  const bounds = useMemo(() => {
    if (!graph || graph.nodes.length === 0) return null
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    graph.nodes.forEach((nd, i) => {
      const x = nd.pos?.x ?? 40
      const y = nd.pos?.y ?? 40 + i * 130
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x + CARD_W)
      maxY = Math.max(maxY, y + 150)
    })
    const M = 320
    return { minX: minX - M, minY: minY - M, maxX: maxX + M, maxY: maxY + M }
  }, [graph])

  // per-node preview stages: cumulative raster output through each node
  const stageMap = useMemo(() => {
    const m = new Map<string, Cells>()
    if (!graph) return m
    const hexValue = (hex: string) => {
      const i = doc.palette.findIndex((c) => c.toLowerCase() === hex.toLowerCase())
      return (i >= 0 ? i : 0) + 1
    }
    const { stages } = evalGraphStages(
      graph,
      {
        bw: doc.cols * doc.sub,
        bh: doc.rows * doc.sub,
        paletteLen: doc.palette.length,
        hexValue,
        baseStyle: obj ? obj.obj.style : elementFromDoc(doc),
      },
      obj?.obj.cells,
    )
    for (const s of stages) m.set(s.id, s.cells)
    return m
  }, [graph, doc, obj])

  // viewport size for scrollbar math
  const [vpSize, setVpSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setVpSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setVpSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const startThumbDrag = (
    e: React.PointerEvent,
    axis: 'x' | 'y',
    spanWorld: number,
    trackPx: number,
  ) => {
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const startPan = { ...pan }
    const factor = (spanWorld * zoom) / Math.max(1, trackPx)
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      setPan(axis === 'x' ? { x: startPan.x - dx * factor, y: startPan.y } : { x: startPan.x, y: startPan.y - dy * factor })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const update = (nodes: GraphNode[], edges?: Graph['edges']) =>
    obj &&
    setObjectGraph(obj.id, {
      graphVersion: 1,
      nodes,
      ...(edges && edges.length > 0 ? { edges } : {}),
    })

  /** world → screen */
  const toScreen = (x: number, y: number) => ({ x: pan.x + x * zoom, y: pan.y + y * zoom })

  const outSocket = (node: GraphNode, index: number) =>
    toScreen((node.pos?.x ?? 0) + CARD_W, (node.pos?.y ?? 40 + index * 130) + SOCKET_Y)
  const inSocket = (node: GraphNode, index: number) =>
    toScreen(node.pos?.x ?? 0, (node.pos?.y ?? 40 + index * 130) + SOCKET_Y)
  const domainOf = (node: GraphNode | undefined, which: 'in' | 'out'): keyof typeof DOMAIN_STYLE => {
    const def = node ? nodeDef(node.op) : undefined
    if (!def) return 'raster'
    const d = def.domain[which]
    return (d === 'none' ? 'raster' : d) as keyof typeof DOMAIN_STYLE
  }

  const setNodePos = (nodeId: string, x: number, y: number) => {
    if (!graph) return
    update(
      graph.nodes.map((n) => (n.id === nodeId ? { ...n, pos: { x, y } } : n)),
      graph.edges,
    )
  }

  const addNode = (op: string) => {
    if (!obj) return
    const el = viewportRef.current
    const world = el
      ? { x: (el.clientWidth / 2 - pan.x) / zoom - CARD_W / 2, y: (el.clientHeight / 2 - pan.y) / zoom }
      : { x: 40, y: 40 }
    const id = `n${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
    const base: Graph = graph ?? { graphVersion: 1, nodes: [] }
    update(
      [...base.nodes, { id, op, params: {}, pos: { x: Math.max(0, world.x), y: Math.max(0, world.y) } }],
      base.edges,
    )
  }

  const autoLayout = () => {
    if (!graph) return
    // depth = longest edge distance from a root; sources land left, styles right
    const depth = new Map<string, number>()
    const incoming = new Map<string, string[]>()
    for (const e of graph.edges ?? []) {
      const list = incoming.get(e.to) ?? []
      list.push(e.from)
      incoming.set(e.to, list)
    }
    const depthOf = (id: string, seen: Set<string>): number => {
      if (depth.has(id)) return depth.get(id)!
      if (seen.has(id)) return 0
      seen.add(id)
      const ins = incoming.get(id) ?? []
      const d = ins.length === 0 ? 0 : Math.max(...ins.map((i) => depthOf(i, seen) + 1))
      depth.set(id, d)
      return d
    }
    for (const n of graph.nodes) depthOf(n.id, new Set())
    const perDepth = new Map<number, number>()
    const nodes = graph.nodes.map((n) => {
      const d = depth.get(n.id) ?? 0
      const row = perDepth.get(d) ?? 0
      perDepth.set(d, row + 1)
      return { ...n, pos: { x: 40 + d * 230, y: 40 + row * 130 } }
    })
    update(nodes, graph.edges)
  }

  /** Zoom & pan so every node card is on screen (the node editor's Fit). */
  const fitView = (g: Graph | null = graph) => {
    if (!g || g.nodes.length === 0) return
    const el = viewportRef.current
    const vw = el?.clientWidth ?? 800
    const vh = el?.clientHeight ?? 600
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of g.nodes) {
      const x = n.pos?.x ?? 0
      const y = n.pos?.y ?? 40 + g.nodes.indexOf(n) * 130
      const h = 36 + Object.keys(nodeDef(n.op)?.params ?? {}).length * 22
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x + CARD_W)
      maxY = Math.max(maxY, y + h)
    }
    const pad = 40
    const z = Math.max(0.25, Math.min(2, Math.min(vw / (maxX - minX + pad * 2), vh / (maxY - minY + pad * 2))))
    setZoom(z)
    setPan({ x: (vw - (maxX - minX) * z) / 2 - minX * z, y: (vh - (maxY - minY) * z) / 2 - minY * z })
  }

  // refit when switching objects (and once when the editor opens)
  const fittedFor = useRef<number | null>(null)
  useEffect(() => {
    if (obj && fittedFor.current !== obj.id) {
      fittedFor.current = obj.id
      fitView()
    }
  })

  /** pan drag starter shared by the hand mode and the background */
  const startPan = (e: React.PointerEvent) => {
    dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y }
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* synthetic pointers have no active id — panning still works uncaptured */
    }
  }

  /* ------------------------------ pointer handling ------------------------------ */

  // two-finger touch: pinch to zoom around the fingers, move to pan — capture-phase
  // listeners win over card dragging, so the gesture works anywhere over the editor
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    const pts = new Map<number, { x: number; y: number }>()
    let start: null | {
      d0: number
      cx0: number
      cy0: number
      pan0: { x: number; y: number }
      zoom0: number
    } = null
    const down = (e: PointerEvent) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size === 2 && !start) {
        dragRef.current = null // a second finger cancels a node drag in progress
        const [a, b] = [...pts.values()]
        start = {
          d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
          cx0: (a.x + b.x) / 2,
          cy0: (a.y + b.y) / 2,
          pan0: { x: panRef.current.x, y: panRef.current.y },
          zoom0: zoomRef.current,
        }
      }
    }
    const move = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (!start || pts.size < 2) return
      e.stopPropagation()
      e.preventDefault()
      const [a, b] = [...pts.values()]
      const d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))
      const r = vp.getBoundingClientRect()
      const cx = (a.x + b.x) / 2 - r.left
      const cy = (a.y + b.y) / 2 - r.top
      const zoom = Math.max(0.25, Math.min(2, start.zoom0 * (d / start.d0)))
      // the world point under the starting centroid stays under the moving one
      const wx = (start.cx0 - r.left - start.pan0.x) / start.zoom0
      const wy = (start.cy0 - r.top - start.pan0.y) / start.zoom0
      setZoom(zoom)
      setPan({ x: cx - wx * zoom, y: cy - wy * zoom })
    }
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId)
      if (pts.size < 2) start = null
    }
    vp.addEventListener('pointerdown', down, true)
    vp.addEventListener('pointermove', move, true)
    vp.addEventListener('pointerup', up, true)
    vp.addEventListener('pointercancel', up, true)
    return () => {
      vp.removeEventListener('pointerdown', down, true)
      vp.removeEventListener('pointermove', move, true)
      vp.removeEventListener('pointerup', up, true)
      vp.removeEventListener('pointercancel', up, true)
    }
  }, [])

  const onBackgroundDown = (e: React.PointerEvent) => {
    if (e.button === 1 || e.button === 0) {
      setSelectedEdge(null)
      setSelectedNodeId(null)
      startPan(e)
    }
  }

  const onBackgroundMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    if (d.kind === 'pan') setPan({ x: d.px + (e.clientX - d.sx), y: d.py + (e.clientY - d.sy) })
    else setNodePos(d.nodeId, d.px + (e.clientX - d.sx) / zoom, d.py + (e.clientY - d.sy) / zoom)
  }

  const onBackgroundUp = () => {
    dragRef.current = null
  }

  const onWheel = (e: React.WheelEvent) => {
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const next = Math.max(0.25, Math.min(2, zoom * factor))
    const applied = next / zoom
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    setPan({ x: mx - (mx - pan.x) * applied, y: my - (my - pan.y) * applied })
    setZoom(next)
  }

  const startWire = (e: React.PointerEvent, fromId: string) => {
    e.stopPropagation()
    setWireDrag({ fromId, x: e.clientX, y: e.clientY })
    const move = (ev: PointerEvent) => setWireDrag((w) => (w ? { ...w, x: ev.clientX, y: ev.clientY } : w))
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const target = document
        .elementFromPoint(ev.clientX, ev.clientY)
        ?.closest('[data-in-node]')
      const toId = target?.getAttribute('data-in-node')
      setWireDrag(null)
      if (!toId || !graph || toId === fromId) return
      // block the connection if it would close a loop back into `fromId`
      const childrenOf = new Map<string, Set<string>>()
      for (const e2 of graph.edges ?? []) {
        const set = childrenOf.get(e2.from) ?? new Set<string>()
        set.add(e2.to)
        childrenOf.set(e2.from, set)
      }
      const reaches = (id: string, want: string, seen: Set<string>): boolean => {
        if (id === want) return true
        if (seen.has(id)) return false
        seen.add(id)
        for (const c of childrenOf.get(id) ?? []) if (reaches(c, want, seen)) return true
        return false
      }
      if (reaches(toId, fromId, new Set())) {
        setImportState({ warnings: [t('editor.cycle')] })
        return
      }
      const edges = (graph.edges ?? []).filter((e) => !(e.from === fromId && e.to === toId))
      update(graph.nodes, [...edges, { from: fromId, to: toId }])
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /* --------------------------------- rendering --------------------------------- */

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden border-line bg-app">
      {/* header: object selector + tools */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold tracking-widest text-muted uppercase">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
            <circle cx="3.4" cy="3.4" r="1.7" />
            <circle cx="11.6" cy="7" r="1.7" />
            <circle cx="4.6" cy="11.4" r="1.7" />
            <path d="M4.8 4.4l5 1.9M10.2 8.4L6 10.7" />
          </svg>
          {t('editor.title')}
        </span>
        <select
          value={obj?.id ?? ''}
          onChange={(e) => setObjId(Number(e.target.value))}
          className="max-w-44 cursor-pointer rounded-md border border-line bg-chip px-1.5 py-1 text-xs text-body outline-none focus:border-accent-line"
        >
          {objects.length === 0 && <option value="">{t('editor.noObjects')}</option>}
          {objects.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
              {o.hasGraph ? ' •' : ''}
            </option>
          ))}
        </select>
        {graph && (
          <>
            <select
              value={addOp}
              onChange={(e) => setAddOp(e.target.value)}
              className="max-w-40 cursor-pointer rounded-md border border-line bg-chip px-1.5 py-1 text-xs text-body outline-none focus:border-accent-line"
            >
              <option value="">{t('graph.addNode')}…</option>
              {groups.map(([category, defs]) => (
                <optgroup key={category} label={category}>
                  {defs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <Chip
              onClick={() => {
                if (addOp) addNode(addOp)
                setAddOp('')
              }}
            >
              {t('graph.add')}
            </Chip>
            <Chip onClick={autoLayout}>{t('editor.autolayout')}</Chip>
          </>
        )}
        {graph && (
          <>
            <Tooltip label={t('editor.fit.desc')}>
              <button
                type="button"
                onClick={() => fitView()}
                title={t('editor.fit.desc')}
                className="flex items-center gap-1 rounded-md border border-line bg-chip px-1.5 py-1 text-xs text-body transition hover:border-chip-line"
              >
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                  <path d="M2 5.5v-2A1.5 1.5 0 013.5 2h2M10.5 2h2A1.5 1.5 0 0114 3.5v2M14 10.5v2a1.5 1.5 0 01-1.5 1.5h-2M5.5 14h-2A1.5 1.5 0 012 12.5v-2" />
                </svg>
                {t('editor.fit')}
              </button>
            </Tooltip>
            <Tooltip label={t('editor.hand.desc')}>
              <button
                type="button"
                onClick={() => setPanMode((v) => !v)}
                aria-pressed={panMode}
                title={t('editor.hand.desc')}
                className={`flex items-center gap-1 rounded-md border px-1.5 py-1 text-xs transition ${
                  panMode ? 'border-accent-line bg-accent-soft text-accent-text' : 'border-line bg-chip text-body hover:border-chip-line'
                }`}
              >
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7.5 1.8c-.8 0-1.2.7-1.2 1.4v4.4M6.3 6.2V3.4c0-.8.6-1.4 1.3-1.4.7 0 1.2.6 1.2 1.4v4.2M8.8 6.6V4.4c0-.7.5-1.3 1.2-1.3s1.2.6 1.2 1.3v3.9M11.2 6.2V5.1c0-.7.5-1.2 1.2-1.2s1.1.5 1.1 1.2v4.4c0 3-2.4 5.4-5.4 5.4-2.2 0-4.1-1.4-4.9-3.4L2 8.6c-.3-.7.1-1.5.9-1.7.6-.2 1.3.1 1.7.7l.7 1.1" />
                </svg>
                {t('editor.hand')}
              </button>
            </Tooltip>
            <Tooltip label={t('editor.preset.desc')}>
              <select
                value={presetId}
                onChange={(e) => {
                  const id = e.target.value
                  setPresetId(id)
                  const preset = GRAPH_PRESETS.find((p) => p.id === id)
                  if (preset && obj) {
                    const fitted = fitGraphToCanvas(preset.graph, doc.cols * doc.sub, doc.rows * doc.sub)
                    setObjectGraph(obj.id, fitted)
                    setImportState({ warnings: [preset.description] })
                    setTimeout(() => fitView(fitted), 0)
                  }
                }}
                className="max-w-48 cursor-pointer rounded-md border border-line bg-chip px-1.5 py-1 text-xs text-body outline-none focus:border-accent-line"
              >
                <option value="">{t('editor.preset')}</option>
                {GRAPH_PRESETS.map((p) => (
                  <option key={p.id} value={p.id} title={p.description}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Tooltip>
          </>
        )}
        {graph && (
          <div className="flex items-center gap-1">
            <Chip onClick={() => download(new Blob([JSON.stringify(graph, null, 2)], { type: 'application/json' }), 'graph.json')}>
              {t('graph.export')}
            </Chip>
            <Tooltip label={t('graph.registry.desc')}>
              <Chip onClick={() => download(new Blob([registryJSON()], { type: 'application/json' }), 'node-registry.json')}>
                {t('graph.registry')}
              </Chip>
            </Tooltip>
            <Chip onClick={() => fileRef.current?.click()}>{t('graph.import')}</Chip>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f || !obj) return
                void f.text().then((text) => {
                  try {
                    const res = validateGraph(JSON.parse(text))
                    setImportState({ warnings: res.warnings })
                    if (res.ok) setObjectGraph(obj.id, res.graph)
                    else setImportState({ error: true, warnings: res.errors })
                  } catch {
                    setImportState({ error: true })
                  }
                })
              }}
            />
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {importState?.error && <span className="text-xs text-red-400">{t('graph.import.bad')}</span>}
          <Tooltip label={nodeEditorMode === 'overlay' ? t('editor.restore') : t('editor.maximize')}>
            <button
              type="button"
              onClick={() => setNodeEditorMode(nodeEditorMode === 'overlay' ? 'split' : 'overlay')}
              aria-label={nodeEditorMode === 'overlay' ? t('editor.restore') : t('editor.maximize')}
              className="rounded-md p-1 text-muted transition hover:bg-chip-active hover:text-body"
            >
              {nodeEditorMode === 'overlay' ? (
                // restore: canvas returns alongside the editor
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <rect x="2" y="2.5" width="12" height="11" rx="1.2" />
                  <path d="M9.5 2.5v11" />
                </svg>
              ) : (
                // maximize: editor covers the canvas
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <rect x="2" y="2.5" width="12" height="11" rx="1.2" />
                  <path d="M2 6h12" />
                </svg>
              )}
            </button>
          </Tooltip>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs text-muted transition hover:bg-chip-active hover:text-body"
          >
            ✕
          </button>
        </div>
      </div>
      {importState?.warnings && importState.warnings.length > 0 && (
        <div className="border-b border-line bg-panel px-3 py-1 text-[10px] text-muted">
          {importState.warnings.join(' · ')}
        </div>
      )}

      {/* canvas */}
      <div
        ref={viewportRef}
        className="relative min-h-0 flex-1 touch-none overflow-hidden"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(127,127,127,0.22) 1px, transparent 1px)',
          backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
          cursor: panMode ? (dragRef.current?.kind === 'pan' ? 'grabbing' : 'grab') : dragRef.current?.kind === 'pan' ? 'grabbing' : 'default',
        }}
        onPointerDown={onBackgroundDown}
        onPointerMove={onBackgroundMove}
        onPointerUp={onBackgroundUp}
        onWheel={onWheel}
      >
        {objects.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="max-w-xs text-center text-xs leading-snug text-muted">{t('editor.noObjects')}</p>
          </div>
        )}
        {objects.length > 0 && !graph && obj && (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <p className="max-w-xs text-center text-xs leading-snug text-muted">{t('editor.noGraph')}</p>
            <Chip onClick={() => setObjectGraph(obj.id, emptyGraph())}>{t('graph.create')}</Chip>
          </div>
        )}
        {graph && (
          <>
            <svg className="pointer-events-none absolute inset-0 h-full w-full">
              {!procedural && graph.nodes.length > 0 && (() => {
                const first = graph.nodes[0]
                const a = toScreen((first.pos?.x ?? 0) - 230 + CARD_W, (first.pos?.y ?? 40) + SOCKET_Y)
                const b = inSocket(first, 0)
                const dx = Math.max(30, Math.abs(b.x - a.x) / 2)
                return (
                  <path
                    d={`M${a.x} ${a.y} C${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`}
                    fill="none"
                    stroke={DOMAIN_STYLE.raster.wire}
                    strokeWidth={1.8}
                    opacity={0.7}
                  />
                )
              })()}
              <defs>
                {graph.edges?.map((e, i) => {
                  const fromIdx = graph.nodes.findIndex((n) => n.id === e.from)
                  const toIdx = graph.nodes.findIndex((n) => n.id === e.to)
                  const from = graph.nodes[fromIdx]
                  const to = graph.nodes[toIdx]
                  if (!from || !to) return null
                  const a = outSocket(from, fromIdx)
                  const b = inSocket(to, toIdx)
                  // wire color flows output (emerald) → input (amber), matching sockets
                  return (
                    <linearGradient key={`g-${i}`} id={`wire-grad-${i}`} gradientUnits="userSpaceOnUse" x1={a.x} y1={a.y} x2={b.x} y2={b.y}>
                      <stop offset="0" stopColor={DOMAIN_STYLE[domainOf(from, 'out')].wire} />
                      <stop offset="1" stopColor={DOMAIN_STYLE[domainOf(to, 'in')].wire} />
                    </linearGradient>
                  )
                })}
              </defs>
              {graph.edges?.map((e, i) => {
                const fromIdx = graph.nodes.findIndex((n) => n.id === e.from)
                const toIdx = graph.nodes.findIndex((n) => n.id === e.to)
                const from = graph.nodes[fromIdx]
                const to = graph.nodes[toIdx]
                if (!from || !to) return null
                const a = outSocket(from, fromIdx)
                const b = inSocket(to, toIdx)
                const d = `M${a.x} ${a.y} C${a.x + 50} ${a.y}, ${b.x - 50} ${b.y}, ${b.x} ${b.y}`
                return (
                  <path
                    key={`${e.from}-${e.to}-${i}`}
                    d={d}
                    fill="none"
                    stroke={selectedEdge === i ? '#f59e0b' : `url(#wire-grad-${i})`}
                    strokeWidth={selectedEdge === i ? 2.5 : 1.8}
                    className="pointer-events-auto cursor-pointer"
                    onClick={() => setSelectedEdge(i)}
                  />
                )
              })}
              {wireDrag && (
                <path
                  d={(() => {
                    const fromIdx = graph.nodes.findIndex((n) => n.id === wireDrag.fromId)
                    const from = graph.nodes[fromIdx]
                    if (!from) return ''
                    const a = outSocket(from, fromIdx)
                    const b = { x: wireDrag.x, y: wireDrag.y }
                    const dx = Math.max(30, Math.abs(b.x - a.x) / 2)
                    return `M${a.x} ${a.y} C${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`
                  })()}
                  fill="none"
                  stroke="#818cf8"
                  strokeDasharray="4 3"
                  strokeWidth={1.8}
                />
              )}
            </svg>
            {/* implicit base-ink card: graphs without source nodes consume it */}
            {!procedural && graph.nodes.length > 0 && (() => {
              const first = graph.nodes[0]
              const basePos = toScreen((first.pos?.x ?? 0) - 230, first.pos?.y ?? 40)
              return (
                <div
                  className="absolute w-[190px] rounded-md border border-dashed border-line bg-chip/60"
                  style={{ transform: `translate(${basePos.x}px, ${basePos.y}px) scale(${zoom})`, transformOrigin: 'top left' }}
                >
                  <Tooltip label={t('editor.baseNode.desc')}>
                    <div className="flex items-center gap-1.5 px-2 py-1.5">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-muted" />
                      <span className="min-w-0 flex-1 truncate text-[11px] text-muted">{t('editor.baseNode')}</span>
                      <span className="text-[8px] font-semibold uppercase text-indigo-300">{t('editor.legend.out')}</span>
                    </div>
                  </Tooltip>
                </div>
              )
            })()}
            {graph.nodes.map((node, index) => {
              const def = nodeDef(node.op)
              // nodes without a saved position (legacy graph, fresh add) stagger down
              // the chain instead of piling up at the origin
              const world = node.pos ?? { x: 40, y: 40 + index * 130 }
              const pos = toScreen(world.x, world.y)
              const kind = def?.kind
              return (
                <div
                  key={node.id}
                  className={`absolute w-[190px] rounded-md border bg-panel shadow-md ${
                    selectedNodeId === node.id ? 'border-accent-line' : 'border-line'
                  } ${node.unknown ? 'opacity-50' : ''}`}
                  style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${zoom})`, transformOrigin: 'top left' }}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    setSelectedNodeId(node.id)
                    setSelectedEdge(null)
                    dragRef.current = {
                      kind: 'node',
                      nodeId: node.id,
                      sx: e.clientX,
                      sy: e.clientY,
                      px: node.pos?.x ?? 0,
                      py: node.pos?.y ?? 0,
                    }
                  }}
                >
                  {/* sockets: Blender-style type coloring — the color says WHAT flows
                      (pixel map vs style params), the side says the direction */}
                  {def && def.domain.in !== 'none' && (
                    <Tooltip label={t('editor.socket.in.desc')}>
                      <span
                        data-in-node={node.id}
                        className={`absolute -left-[7px] top-[15px] h-3.5 w-3.5 rounded-full border-2 ${DOMAIN_STYLE[def.domain.in].socketRing}`}
                        title={t('editor.socket.in.desc')}
                      />
                    </Tooltip>
                  )}
                  {def && def.kind !== 'style' && (
                    <Tooltip label={t('editor.socket.out.desc')}>
                      <span
                        data-out-node={node.id}
                        onPointerDown={(e) => {
                          if (panMode) return
                          e.stopPropagation()
                          startWire(e, node.id)
                        }}
                        className={`absolute -right-[7px] top-[15px] h-3.5 w-3.5 cursor-crosshair rounded-full border-2 ${DOMAIN_STYLE[def.domain.out].socketRing} hover:brightness-125`}
                        title={t('editor.socket.out.desc')}
                      />
                    </Tooltip>
                  )}
                  {/* header doubles as the drag handle */}
                  <div
                    className="flex cursor-move items-center gap-1.5 rounded-t-md border-b border-line bg-raised px-2 py-1.5"
                    onPointerDown={(e) => {
                      if (panMode) return
                      e.stopPropagation()
                      setSelectedNodeId(node.id)
                      dragRef.current = {
                        kind: 'node',
                        nodeId: node.id,
                        sx: e.clientX,
                        sy: e.clientY,
                        px: node.pos?.x ?? 0,
                        py: node.pos?.y ?? 0,
                      }
                      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                    }}
                  >
                    {def && def.kind !== 'source' && (
                      <span
                        className="shrink-0 text-[8px] font-semibold uppercase"
                        style={{ color: DOMAIN_STYLE[def.domain.in === 'none' ? 'raster' : def.domain.in].wire }}
                      >
                        {t('editor.legend.in')}
                      </span>
                    )}
                    <span className={`h-2 w-2 shrink-0 rounded-full ${kind ? KIND_DOT[kind] : 'bg-muted'}`} />
                    <span
                      className={`min-w-0 flex-1 truncate text-[11px] font-medium ${
                        node.unknown ? 'text-muted line-through' : 'text-body'
                      }`}
                    >
                      {def?.label ?? node.op}
                    </span>
                    {def && def.kind !== 'style' && (
                      <span
                        className="shrink-0 text-[8px] font-semibold uppercase"
                        style={{ color: DOMAIN_STYLE[def.domain.out].wire }}
                      >
                        {t('editor.legend.out')}
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label={t('graph.remove')}
                      className="rounded px-1 text-[11px] text-muted transition hover:text-red-400"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        update(
                          graph.nodes.filter((n) => n.id !== node.id),
                          graph.edges?.filter((e2) => e2.from !== node.id && e2.to !== node.id),
                        )
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  {/* live preview: raster nodes show their stage output, style nodes a sample */}
                  {(() => {
                    const stage = stageMap.get(node.id)
                    if (stage && stage.size > 0)
                      return (
                        <div className="flex justify-center px-2 pt-1.5">
                          <CellsPreview cells={stage} palette={doc.palette} bw={doc.cols * doc.sub} w={166} h={44} />
                        </div>
                      )
                    if (def?.kind === 'style')
                      return (
                        <div className="flex justify-center px-2 pt-1.5">
                          <StyleSamplePreview
                            style={evaluatedStyleFor(node.op, node.params, obj.obj.style)}
                            baseDoc={doc}
                            w={166}
                            h={44}
                          />
                        </div>
                      )
                    return null
                  })()}
                  <div className="flex flex-col gap-1 px-2 py-1.5">
                    {def
                      ? Object.entries(def.params).map(([pkey, spec]) => (
                          <div key={pkey} className="flex items-center justify-between gap-1.5 text-[10px] text-muted">
                            <span className="shrink-0">{pkey}</span>
                            <ParamInput pkey={pkey} spec={spec} value={node.params[pkey]} onChange={(v) => updateParam(obj.id, node.id, pkey, v)} />
                          </div>
                        ))
                      : <span className="text-[10px]">{t('graph.unknown')}</span>}
                  </div>
                </div>
              )
            })}
          </>
        )}
        {/* navigation scrollbars (pan indicators) */}
        {bounds && vpSize.w > 0 && (() => {
          const spanX = Math.max(1, bounds.maxX - bounds.minX)
          const spanY = Math.max(1, bounds.maxY - bounds.minY)
          const visW = vpSize.w / zoom
          const visH = vpSize.h / zoom
          const fracW = Math.max(0.08, Math.min(1, visW / spanX))
          const fracH = Math.max(0.08, Math.min(1, visH / spanY))
          const aX = -pan.x / zoom
          const aY = -pan.y / zoom
          const leftFX = Math.max(0, Math.min(1 - fracW, (aX - bounds.minX) / spanX))
          const topFY = Math.max(0, Math.min(1 - fracH, (aY - bounds.minY) / spanY))
          return (
            <>
              <div
                className="pointer-events-auto absolute bottom-0 left-0 right-0 h-2 bg-black/30"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div
                  className="h-full rounded-full bg-line/80 transition-colors hover:bg-accent-line"
                  style={{ marginLeft: `${leftFX * 100}%`, width: `${fracW * 100}%` }}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    startThumbDrag(e, 'x', spanX, vpSize.w)
                  }}
                />
              </div>
              <div
                className="pointer-events-auto absolute bottom-2 right-0 top-0 w-2 bg-black/30"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div
                  className="w-full rounded-full bg-line/80 transition-colors hover:bg-accent-line"
                  style={{ marginTop: `${topFY * 100}%`, height: `${fracH * 100}%` }}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    startThumbDrag(e, 'y', spanY, vpSize.h)
                  }}
                />
              </div>
            </>
          )
        })()}
        {/* hint bar with the socket color legend */}
        <div className="pointer-events-none absolute bottom-2 left-1/2 flex max-w-full -translate-x-1/2 items-center gap-2 overflow-hidden whitespace-nowrap rounded-md bg-black/50 px-2.5 py-1 text-[10px] text-white/80 backdrop-blur-sm">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full border border-amber-300 bg-amber-400/60" />
            {t('editor.legend.in')}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full border border-emerald-300 bg-emerald-400/60" />
            {t('editor.legend.out')}
          </span>
          <span className="opacity-60">·</span>
          <span>{t('editor.wireHint')}</span>
        </div>
      </div>
    </div>
  )

  function updateParam(objId: number, nodeId: string, key: string, value: number | string | boolean) {
    if (!graph) return
    setObjectGraph(
      objId,
      {
        graphVersion: 1,
        nodes: graph.nodes.map((n) => (n.id === nodeId ? { ...n, params: { ...n.params, [key]: value } } : n)),
        edges: graph.edges,
      },
    )
  }
}

/** Compact inline param editor used on the node cards. */
function ParamInput({
  pkey,
  spec,
  value,
  onChange,
}: {
  pkey: string
  spec: NodeParamSpec
  value: unknown
  onChange: (v: number | string | boolean) => void
}) {
  const { t } = useI18n()
  const doc = useStore((s) => s.doc)
  if (spec.kind === 'number' || spec.kind === 'int') {
    const current = typeof value === 'number' ? value : spec.default
    // drag stops at the canvas-derived range; typing may reach the schema bounds
    const soft = boundsWithValue(paramBounds(spec, doc) ?? { min: spec.min, max: spec.max }, current)
    return (
      <DragNumber
        value={current}
        min={spec.min}
        max={spec.max}
        softMin={soft.min}
        softMax={soft.max}
        step={spec.kind === 'int' ? 1 : (spec.step ?? 0.01)}
        int={spec.kind === 'int'}
        ariaLabel={pkey}
        title={t('num.scrub')}
        className="w-16"
        onChange={onChange}
      />
    )
  }
  if (spec.kind === 'select') {
    return (
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 cursor-pointer rounded border border-line bg-chip px-1 py-0.5 text-[10px] text-body outline-none focus:border-accent-line"
      >
        {spec.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    )
  }
  if (spec.kind === 'hex') {
    return (
      <span className="flex items-center gap-1">
        <span>{typeof value === 'string' ? value : spec.default}</span>
        <input
          type="color"
          value={typeof value === 'string' ? value : spec.default}
          onChange={(e) => onChange(e.target.value)}
          className="h-4 w-6 cursor-pointer rounded border border-line bg-transparent"
        />
      </span>
    )
  }
  return (
    <input
      type="checkbox"
      checked={value === true}
      onChange={(e) => onChange(e.target.checked)}
      className="h-3 w-3 accent-indigo-400"
    />
  )
}
