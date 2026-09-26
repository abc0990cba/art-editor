import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'

import { brushAnchor } from '../../engine/brush.ts'
import { STAGE_THEMES, docExtent, type Doc } from '../../engine/doc.ts'
import { buildGeometry, stagingPreview, type Geometry } from '../../engine/geometry.ts'
import { marchingSquares, type Pt } from '../../engine/marching-squares.ts'
import { drawGeometry } from '../../engine/png.ts'
import { nodeProtected, objLayer, type SceneLayer } from '../../engine/scene.ts'
import { scrollbarMetrics } from '../../engine/scrollbars.ts'
import { isShapeTool } from '../../engine/shapes.ts'
import { symmetryPoints } from '../../engine/symmetry.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { useStore } from '../../state/editor.store.ts'
import {
  ANTS_SPEED,
  SCROLLBAR,
  blobCells,
  checkerTileFor,
  drawGuides,
  polyPath,
  sizeCanvas,
  type DragState,
  type Hover,
} from './canvas-stage.util.ts'
import { useCanvasStaging } from './use-canvas-staging.hook.ts'
import { ZoomControls } from './zoom-controls.component.tsx'

export function CanvasStage({ onDropFile }: { onDropFile?: (file: File) => void } = {}) {
  const { t } = useI18n()
  const doc = useStore((s) => s.doc)
  const tool = useStore((s) => s.tool)
  const color = useStore((s) => s.color)
  const brush = useStore((s) => s.brush)
  const brushSnap = useStore((s) => s.brushSnap)
  const symmetry = useStore((s) => s.symmetry)
  const fillScope = useStore((s) => s.fillScope)
  const toolOpts = useStore((s) => s.toolOpts)
  const concentricRadii = useStore((s) => s.concentricRadii)
  const showGrid = useStore((s) => s.showGrid)
  const fillAt = useStore((s) => s.fillAt)
  const paintFillRegion = useStore((s) => s.paintFillRegion)
  const addLinks = useStore((s) => s.addLinks)
  const setColor = useStore((s) => s.setColor)
  const shapePaint = useStore((s) => s.shapePaint)
  const fillStyle = useStore((s) => s.fillStyle)
  const selection = useStore((s) => s.selection)
  const selectElements = useStore((s) => s.selectElements)
  const toggleSelection = useStore((s) => s.toggleSelection)
  const clearSelection = useStore((s) => s.clearSelection)
  const moveSelection = useStore((s) => s.moveSelection)
  const fillSelection = useStore((s) => s.fillSelection)
  const activeLayerId = useStore((s) => s.activeLayerId)
  const setActiveLayer = useStore((s) => s.setActiveLayer)

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  // offscreen bitmap of the committed artwork: rebuilt only when the committed geometry
  // or the view changes, so stroke frames just blit it and composite the staged delta
  const artLayerRef = useRef<{
    canvas: HTMLCanvasElement
    w: number
    h: number
    dpr: number
    zoom: number
    x: number
    y: number
    geometry: Geometry | null
  } | null>(null)
  // scratch canvas for outside-only selection/hover strokes (marching ants)
  const scratchRef = useRef<HTMLCanvasElement | null>(null)
  // ants dash phase (screen px); driven by a rAF loop without re-rendering React
  const antsOffsetRef = useRef(0)
  const drawOverlayRef = useRef<() => void>(() => {})
  // kept fresh for the staging rAF loop, which draws without a React re-render
  const drawBaseRef = useRef<() => void>(() => {})
  // lazily-initialized prefers-reduced-motion (null = not queried yet)
  const reducedMotionRef = useRef<boolean | null>(null)
  // image file dragged over the stage — shows the import drop hint
  const [importDragOver, setImportDragOver] = useState(false)
  // a select click hit artwork while styles are canvas-wide (no elements to pick):
  // explain instead of failing silently; auto-hides after a few seconds
  const [scopeHint, setScopeHint] = useState(false)
  const scopeHintTimer = useRef<number>(0)

  const resolvedTheme = useStore((s) => s.resolvedTheme)
  const stage = STAGE_THEMES[resolvedTheme]
  const setStyleScope = useStore((s) => s.setStyleScope)

  const showScopeHint = () => {
    window.clearTimeout(scopeHintTimer.current)
    setScopeHint(true)
    scopeHintTimer.current = window.setTimeout(() => setScopeHint(false), 6000)
  }
  useEffect(() => () => window.clearTimeout(scopeHintTimer.current), [])

  /** The resolved active layer + its protection, read fresh from the store. */
  const activeLayerState = useCallback((): { id: number | null; locked: boolean } => {
    const { doc, activeLayerId: alid } = useStore.getState()
    if (!doc.layers) return { id: null, locked: false }
    // a stale id falls back to the topmost visible, unlocked layer (e.g. after reload,
    // where the UI-only active-layer choice is gone)
    const usable = (l: SceneLayer) => l.visible && !l.locked
    const layer =
      (alid == null ? null : doc.layers.find((l) => l.id === alid)) ??
      [...doc.layers].reverse().find(usable) ??
      doc.layers.at(-1)
    if (!layer) return { id: null, locked: false }
    // a hidden active layer is not a paint target either
    return { id: layer.id, locked: !layer.visible || nodeProtected(doc.layers, layer.id) }
  }, [])

  const extent = docExtent(doc)

  const [view, setView] = useState({ zoom: 8, x: 0, y: 0 })
  // live mirror: the touch-gesture effect mounts once and reads the view at pinch start
  const viewRef = useRef(view)
  viewRef.current = view
  const [wrapSize, setWrapSize] = useState({ w: 0, h: 0 })
  const fittedRef = useRef(false)
  const [resizeCount, bumpResize] = useReducer((x: number) => x + 1, 0)
  const [panning, setPanning] = useState(false)
  const [spaceDown, setSpaceDown] = useState(false)
  const spaceRef = useRef(false)

  const fit = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const z = Math.min(r.width / extent.w, r.height / extent.h) * 0.88
    setView({ zoom: z, x: (r.width - extent.w * z) / 2, y: (r.height - extent.h * z) / 2 })
  }, [extent.w, extent.h])

  useEffect(() => {
    if (fittedRef.current) return
    fittedRef.current = true
    fit()
  }, [fit])

  // zoom-to-fit requested from the hotkey or the toolbar button
  const fitSignal = useStore((s) => s.fitSignal)
  useEffect(() => {
    if (fitSignal > 0) fit()
  }, [fitSignal, fit])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      bumpResize()
      setWrapSize({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    setWrapSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const {
    stagingRef,
    bumpStaging,
    scheduleStaging,
    ensureStaging,
    expand,

    connectorCopies,

    stampBrush,

    stampShape,
    fillSeeds,
    commitStaging,

    shapeStartRef,
    shapeLastRef,
    isSquare,
    grid,
    bw,
    bh,
    radialOpts,
    tipOffsets,
  } = useCanvasStaging({
    doc,
    brush,
    brushSnap,
    symmetry,
    tool,
    color,
    fillScope,
    toolOpts,
    concentricRadii,
    shapePaint,
    fillStyle,
    activeLayerState,
    // stroke frames draw imperatively: staging rAF → direct base + overlay redraw, no React
    onStagingFrame: () => {
      drawBaseRef.current()
      drawOverlayRef.current()
    },
  })

  // committed geometry only: during strokes the base layer composites the staged delta
  // on top of a cached artwork bitmap (see the base render effect), so the full-document
  // rebuild runs on doc changes — not on every rAF tick of a stroke
  const geometry = useMemo(() => buildGeometry(doc), [doc])

  const [hover, setHover] = useState<Hover | null>(null)
  const drag = useRef<DragState | null>(null)
  // active scrollbar thumb drag: axis, pointer start, view start and px-per-doc scale
  const scrollDrag = useRef<{
    axis: 'x' | 'y'
    startPx: number
    startView: number
    scale: number
  } | null>(null)
  // reactive mirror of drag.current so the overlay layer can react to stroke start/end
  const [dragKind, setDragKind] = useState<DragState['kind'] | null>(null)
  const [pendingLink, setPendingLink] = useState<{ ax: number; ay: number } | null>(null)

  /** Doc-space point under the pointer */
  const toDoc = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const el = canvasRef.current
      if (!el) return null
      const r = el.getBoundingClientRect()
      return {
        x: (e.clientX - r.left - view.x) / view.zoom,
        y: (e.clientY - r.top - view.y) / view.zoom,
      }
    },
    [view],
  )

  /** Buffer index under the pointer (-1 outside) */
  const toIndex = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const p = toDoc(e)
      if (!p) return -1
      if (isSquare) {
        const bx = Math.floor(p.x * doc.sub)
        const by = Math.floor(p.y * doc.sub)
        if (bx < 0 || by < 0 || bx >= bw || by >= bh) return -1
        return by * bw + bx
      }
      return grid.cellAt(p.x, p.y)
    },
    [toDoc, isSquare, doc.sub, bw, bh, grid],
  )

  // Finish a drag no matter where the pointer ends up: window-level pointerup,
  // pointercancel and blur all clear the in-flight stroke so a lost pointerup
  // can never turn later hover moves into stray stamps. A selection move drag
  // commits through moveSelection instead of the paint path.
  const finishDragRef = useRef<() => void>(() => {})
  finishDragRef.current = () => {
    const d = drag.current
    if (!d) return
    drag.current = null
    setDragKind(null)
    setPanning(false)
    if (d.kind === 'move') {
      stagingRef.current = null
      bumpStaging()
      if ((d.dx ?? 0) !== 0 || (d.dy ?? 0) !== 0) moveSelection(d.dx!, d.dy!)
      return
    }
    commitStaging()
  }
  useEffect(() => {
    const stop = () => finishDragRef.current()
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    window.addEventListener('blur', stop)
    return () => {
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      window.removeEventListener('blur', stop)
    }
  }, [])

  // ---- pointer handlers ----
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* synthetic pointers have no active id — drawing still works uncaptured */
    }
    if (e.button === 1 || spaceRef.current) {
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, panX: view.x, panY: view.y }
      setDragKind('pan')
      setPanning(true)
      return
    }
    if (e.button !== 0) return
    const p = toDoc(e)
    if (!p) return
    const idx = toIndex(e)
    // painting tools are no-ops while the active layer is locked (or under a locked parent)
    const drawBlocked = tool !== 'select' && tool !== 'picker' ? activeLayerState().locked : false
    switch (tool) {
      case 'select': {
        // locked or hidden-ancestor objects are not pickable
        const rawObj = idx >= 0 ? (doc.cellObj?.[idx] ?? 0) : 0
        const obj = rawObj > 0 && !(doc.layers && nodeProtected(doc.layers, rawObj)) ? rawObj : 0
        if (e.shiftKey) {
          if (obj > 0) toggleSelection(obj)
          break
        }
        if (obj > 0) {
          const already = selection.includes(obj)
          if (!already) selectElements([obj])
          // clicking an object makes its layer the active one
          if (doc.layers) {
            const layerId = objLayer(doc.layers, obj)?.id
            if (layerId != null && layerId !== activeLayerId) setActiveLayer(layerId)
          }
          const sel = already ? selection : [obj]
          // snapshot the selected cells so the drag preview knows what moves
          let moved: [number, number, number][] = []
          if (isSquare && doc.cellObj) {
            moved = []
            for (let i = 0; i < doc.cellObj.length; i++) {
              const o = doc.cellObj[i]
              if (o > 0 && sel.includes(o) && doc.cells[i] > 0) moved.push([i, doc.cells[i], o])
            }
          }
          drag.current = { kind: 'move', sx: p.x, sy: p.y, moved, dx: 0, dy: 0 }
          setDragKind('move')
        } else {
          clearSelection()
          // artwork is there but unselectable: canvas-wide styles keep cellObj empty,
          // so a select click would do nothing — surface why instead of staying silent
          if (doc.styleScope === 'global' && idx >= 0 && doc.cells[idx] > 0) showScopeHint()
        }
        break
      }
      case 'pencil':
      case 'eraser': {
        if (drawBlocked) break
        const ds: DragState = { kind: 'draw', last: idx, removedLinks: new Set() }
        drag.current = ds
        setDragKind('draw')
        stampBrush(idx, tool === 'eraser', ds, p, e.altKey)
        break
      }
      case 'fill': {
        if (idx < 0 || drawBlocked) break
        // a click on a selected shape re-fills every selected shape with the current style
        const hitObj = doc.cellObj?.[idx] ?? 0
        if (hitObj > 0 && selection.includes(hitObj)) {
          fillSelection()
          break
        }
        const seeds = fillSeeds(idx)
        if (seeds) {
          // sector/ring scope paints the seed set directly: a flood fill from every
          // seed would leak through unpainted neighbors onto the whole canvas
          paintFillRegion(seeds, color)
        } else {
          fillAt(expand(idx), color)
        }
        break
      }
      case 'picker': {
        if (idx >= 0) {
          const v = doc.cells[idx]
          if (v > 0) setColor(doc.palette[(v - 1) % doc.palette.length])
        }
        break
      }
      case 'line':
      case 'rect':
      case 'ellipse':
      case 'star':
      case 'polygon':
      case 'diamond':
      case 'heart':
      case 'spiral':
      case 'arrow':
      case 'lightning':
      case 'moon':
      case 'wave':
      case 'cross':
      case 'flower':
      case 'gear':
      case 'sun':
      case 'bento':
      case 'zigzag':
      case 'ring':
      case 'arc':
      case 'drop':
      case 'chevron':
      case 'concentric':
      case 'concentricRect':
      case 'skull': {
        if (drawBlocked) break
        drag.current = { kind: 'shape', start: [p.x, p.y] }
        shapeStartRef.current = [p.x, p.y]
        shapeLastRef.current = [p.x, p.y]
        setDragKind('shape')
        break
      }
      case 'connector': {
        if (drawBlocked) break
        if (isSquare) {
          const px = Math.floor(p.x)
          const py = Math.floor(p.y)
          if (px < 0 || py < 0 || px >= doc.cols || py >= doc.rows) break
          if (pendingLink) {
            addLinks(connectorCopies(pendingLink, { ax: px, ay: py }), color)
            setPendingLink(null)
            stagingRef.current = null
            bumpStaging()
          } else {
            setPendingLink({ ax: px, ay: py })
          }
        } else {
          if (idx < 0) break
          if (pendingLink) {
            addLinks(connectorCopies(pendingLink, { ax: idx, ay: 0 }), color)
            setPendingLink(null)
            stagingRef.current = null
            bumpStaging()
          } else {
            setPendingLink({ ax: idx, ay: 0 })
          }
        }
        break
      }
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // a drag whose button was released outside the canvas must not keep painting
    if (drag.current && e.buttons === 0) {
      finishDragRef.current()
      return
    }
    const p = toDoc(e)
    const idx = toIndex(e)
    // skip redundant updates: a fresh object here re-renders the whole stage on every move
    setHover((prev) => {
      if (idx >= 0) return prev?.idx === idx ? prev : { idx }
      return prev === null ? prev : null
    })
    const d = drag.current
    if (!d) {
      // connector preview follows the pointer between the two clicks, with its symmetry copies
      if (pendingLink && p && isSquare) {
        const st = ensureStaging()
        st.cells.clear()
        const px = Math.floor(p.x)
        const py = Math.floor(p.y)
        if (px >= 0 && py >= 0 && px < doc.cols && py < doc.rows) {
          st.links = [...doc.links, ...connectorCopies(pendingLink, { ax: px, ay: py })]
          scheduleStaging()
        }
      } else if (pendingLink && p && !isSquare) {
        const st = ensureStaging()
        st.cells.clear()
        const idx2 = grid.cellAt(p.x, p.y)
        if (idx2 >= 0) {
          st.links = [...doc.links, ...connectorCopies(pendingLink, { ax: idx2, ay: 0 })]
          scheduleStaging()
        }
      }
      return
    }
    if (d.kind === 'pan') {
      setView((v) => ({ ...v, x: d.panX! + (e.clientX - d.sx!), y: d.panY! + (e.clientY - d.sy!) }))
      return
    }
    if (d.kind === 'move') {
      if (!p || !d.moved || d.moved.length === 0) return
      const ndx = Math.round(p.x - d.sx!)
      const ndy = Math.round(p.y - d.sy!)
      if (ndx === d.dx && ndy === d.dy) return
      d.dx = ndx
      d.dy = ndy
      // ghost preview: sources erased, copies painted at the offset with their element ids
      const st = ensureStaging()
      st.cells.clear()
      st.objs!.clear()
      st.links = doc.links
      const sub = doc.sub
      const bdx = ndx * sub
      const bdy = ndy * sub
      const nbw = bw
      const nbh = bh
      for (const [i, v, o] of d.moved) {
        st.cells.set(i, null)
        st.objs!.set(i, null)
        const x = (i % nbw) + bdx
        const y = Math.floor(i / nbw) + bdy
        if (x < 0 || y < 0 || x >= nbw || y >= nbh) continue
        const t = y * nbw + x
        st.cells.set(t, v)
        st.objs!.set(t, o)
      }
      scheduleStaging()
      return
    }
    if (!p) return
    if (d.kind === 'draw') {
      if (d.last !== idx) {
        d.last = idx
        stampBrush(idx, tool === 'eraser', d, p, e.altKey)
      }
      return
    }
    if (d.kind === 'shape') {
      shapeLastRef.current = [p.x, p.y]
      stampShape({ x: d.start![0], y: d.start![1] }, p, e.altKey)
    }
  }

  const onPointerUp = () => {
    finishDragRef.current()
  }

  // ---- two-finger touch: pinch to zoom, move to pan (Procreate-style) ----
  // capture-phase listeners see both pointers before the drawing handlers; the
  // in-progress stroke is cancelled the moment the second finger lands
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const pts = new Map<number, { x: number; y: number }>()
    let start: null | {
      d0: number
      cx0: number
      cy0: number
      view: { zoom: number; x: number; y: number }
    } = null
    const cancelStroke = () => {
      drag.current = null
      shapeStartRef.current = null
      shapeLastRef.current = null
      setPendingLink(null)
      if (stagingRef.current) {
        stagingRef.current = null
        bumpStaging()
      }
    }
    const down = (e: PointerEvent) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size === 2 && !start) {
        cancelStroke()
        const [a, b] = [...pts.values()]
        const r = el.getBoundingClientRect()
        start = {
          d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
          cx0: (a.x + b.x) / 2 - r.left,
          cy0: (a.y + b.y) / 2 - r.top,
          view: { ...viewRef.current },
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
      const r = el.getBoundingClientRect()
      const cx = (a.x + b.x) / 2 - r.left
      const cy = (a.y + b.y) / 2 - r.top
      // computed eagerly from the gesture-start snapshot: the setState updater may
      // flush after the gesture ended and `start` was cleared
      const zoom = Math.min(80, Math.max(0.5, start.view.zoom * (d / start.d0)))
      const wx = (start.cx0 - start.view.x) / start.view.zoom
      const wy = (start.cy0 - start.view.y) / start.view.zoom
      setView({ zoom, x: cx - wx * zoom, y: cy - wy * zoom })
    }
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId)
      if (pts.size < 2) start = null
    }
    el.addEventListener('pointerdown', down, true)
    el.addEventListener('pointermove', move, true)
    el.addEventListener('pointerup', up, true)
    el.addEventListener('pointercancel', up, true)
    return () => {
      el.removeEventListener('pointerdown', down, true)
      el.removeEventListener('pointermove', move, true)
      el.removeEventListener('pointerup', up, true)
      el.removeEventListener('pointercancel', up, true)
    }
  }, [])

  // ---- zoom ----
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const mx = e.clientX - r.left
      const my = e.clientY - r.top
      setView((v) => {
        const k = Math.exp(-e.deltaY * 0.0015)
        const z = Math.min(80, Math.max(0.5, v.zoom * k))
        const s = z / v.zoom
        return { zoom: z, x: mx - (mx - v.x) * s, y: my - (my - v.y) * s }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ---- space to pan ----
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement).closest('input,textarea,select')) {
        spaceRef.current = true
        setSpaceDown(true)
        e.preventDefault()
      }
      if (e.key === 'Escape') {
        setPendingLink(null)
        stagingRef.current = null
        bumpStaging()
        clearSelection()
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceRef.current = false
        setSpaceDown(false)
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [clearSelection])

  // cancel a pending connector when the tool changes
  useEffect(() => {
    if (tool !== 'connector' && pendingLink) {
      setPendingLink(null)
      stagingRef.current = null
      bumpStaging()
    }
  }, [tool, pendingLink])

  // cached overlay path of every cell polygon (non-square grids)
  const gridOverlayPath = useMemo(() => {
    if (isSquare) return null
    const p = new Path2D()
    for (let i = 0; i < grid.count; i++) {
      const poly = grid.polygon(i)
      p.moveTo(poly[0].x, poly[0].y)
      for (let k = 1; k < poly.length; k++) p.lineTo(poly[k].x, poly[k].y)
      p.closePath()
    }
    return p
  }, [isSquare, grid])

  // square-grid lines as one prebuilt Path2D: up to ~3000 moveTo/lineTo segments per
  // direction on a 500×500 grid are far too costly to rebuild on every rendered frame
  const gridLinePaths = useMemo(() => {
    if (!isSquare) return null
    const W = extent.w
    const H = extent.h
    const cell = new Path2D()
    for (let x = 1; x < bw; x++) {
      cell.moveTo(x / doc.sub, 0)
      cell.lineTo(x / doc.sub, H)
    }
    for (let y = 1; y < bh; y++) {
      cell.moveTo(0, y / doc.sub)
      cell.lineTo(W, y / doc.sub)
    }
    let pixel: Path2D | null = null
    if (doc.sub > 1) {
      pixel = new Path2D()
      for (let x = 1; x < W; x++) {
        pixel.moveTo(x, 0)
        pixel.lineTo(x, H)
      }
      for (let y = 1; y < H; y++) {
        pixel.moveTo(0, y)
        pixel.lineTo(W, y)
      }
    }
    return { cell, pixel }
  }, [isSquare, bw, bh, doc.sub, extent.w, extent.h])

  interface ElementOutline {
    path: Path2D
    /** Bounding box in doc units, for the selection size badge */
    minX: number
    minY: number
    maxX: number
    maxY: number
  }

  /** Region contour (doc units) around every cell owned by the given element ids. */
  const elementOutline = useCallback(
    (ids: number[]): ElementOutline | null => {
      if (!doc.cellObj || ids.length === 0) return null
      const set = new Set(ids)
      const w = bw + 2
      const h = bh + 2
      const field = new Float32Array(w * h)
      let any = false
      let minX = bw
      let minY = bh
      let maxX = -1
      let maxY = -1
      for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
          const i = y * bw + x
          if (doc.cells[i] > 0 && set.has(doc.cellObj[i])) {
            field[(y + 1) * w + (x + 1)] = 1
            any = true
            if (x < minX) minX = x
            if (y < minY) minY = y
            if (x > maxX) maxX = x
            if (y > maxY) maxY = y
          }
        }
      }
      if (!any) return null
      const loops: Pt[][] = marchingSquares(field, w, h, 0.5)
      const path = new Path2D()
      for (const loop of loops) {
        loop.forEach((p, k) => {
          const x = (p.x - 0.5) / doc.sub
          const y = (p.y - 0.5) / doc.sub
          if (k === 0) path.moveTo(x, y)
          else path.lineTo(x, y)
        })
        path.closePath()
      }
      return {
        path,
        minX: minX / doc.sub,
        minY: minY / doc.sub,
        maxX: (maxX + 1) / doc.sub,
        maxY: (maxY + 1) / doc.sub,
      }
    },
    [doc.cellObj, doc.cells, doc.sub, bw, bh],
  )

  // Outline cache: building a contour allocates a full-buffer float field and runs
  // marching squares over it — far too slow to redo on every hover move in select mode.
  // Keyed per doc; the doc only changes on commit, so hits cover all hover/redraw work.
  const outlineCacheRef = useRef<{ doc: Doc; map: Map<string, ElementOutline | null> } | null>(null)
  const cachedOutline = useCallback(
    (ids: number[]): ElementOutline | null => {
      const key = [...ids].sort((a, b) => a - b).join(',')
      let c = outlineCacheRef.current
      if (!c || c.doc !== doc) c = outlineCacheRef.current = { doc, map: new Map() }
      const hit = c.map.get(key)
      if (hit !== undefined) return hit
      const built = elementOutline(ids)
      if (c.map.size > 128) c.map.clear()
      c.map.set(key, built)
      return built
    },
    [elementOutline, doc],
  )

  const hoverObj = hover && tool === 'select' ? (doc.cellObj?.[hover.idx] ?? 0) : 0

  // ---- base layer render: cached artwork blit + staged delta composite + grid lines ----
  const drawBase = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const size = sizeCanvas(canvas, wrap)
    if (!size) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = extent.w
    const H = extent.h
    const docSpaceOn = (c: CanvasRenderingContext2D) => {
      c.translate(view.x, view.y)
      c.scale(view.zoom, view.zoom)
    }
    const fillBg = () => {
      if (doc.bg) {
        ctx.fillStyle = doc.bg
        ctx.fillRect(0, 0, W, H)
      } else {
        // checkerboard via a repeating 1-unit pattern: O(1) regardless of canvas size
        const pattern = ctx.createPattern(checkerTileFor(resolvedTheme, stage), 'repeat')
        if (pattern) {
          ctx.imageSmoothingEnabled = false
          ctx.fillStyle = pattern
          ctx.fillRect(0, 0, W, H)
          ctx.imageSmoothingEnabled = true
        }
      }
    }
    const strokeGrid = () => {
      if (!showGrid || view.zoom < 4) return
      if (isSquare) {
        if (!gridLinePaths) return
        ctx.strokeStyle = stage.gridLine
        ctx.lineWidth = 1 / view.zoom
        ctx.stroke(gridLinePaths.cell)
        if (gridLinePaths.pixel) {
          ctx.strokeStyle = stage.pixelLine
          ctx.stroke(gridLinePaths.pixel)
        }
      } else if (gridOverlayPath) {
        ctx.strokeStyle = stage.gridLine
        ctx.lineWidth = 1 / view.zoom
        ctx.stroke(gridOverlayPath)
      }
    }

    // committed artwork bitmap: rebuilt only when the committed geometry or the view
    // changes — stroke frames (stagingVersion ticks) skip this entirely
    let art = artLayerRef.current
    if (!art) {
      art = artLayerRef.current = {
        canvas: document.createElement('canvas'),
        w: 0,
        h: 0,
        dpr: 1,
        zoom: 1,
        x: 0,
        y: 0,
        geometry: null,
      }
    }
    if (
      art.geometry !== geometry ||
      art.zoom !== view.zoom ||
      art.x !== view.x ||
      art.y !== view.y ||
      art.w !== size.w ||
      art.h !== size.h ||
      art.dpr !== size.dpr
    ) {
      art.geometry = geometry
      art.zoom = view.zoom
      art.x = view.x
      art.y = view.y
      art.w = size.w
      art.h = size.h
      art.dpr = size.dpr
      art.canvas.width = Math.round(size.w * size.dpr)
      art.canvas.height = Math.round(size.h * size.dpr)
      const actx = art.canvas.getContext('2d')
      if (actx) {
        actx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
        actx.clearRect(0, 0, size.w, size.h)
        actx.save()
        docSpaceOn(actx)
        drawGeometry(actx, geometry.paths)
        actx.restore()
      }
    }

    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)

    const st = stagingRef.current
    const stCells = st?.cells
    const preview = stCells && stCells.size > 0 ? stagingPreview(doc, st) : null

    if (preview) {
      // incremental stroke frame: blit the committed art, punch the staged erases out,
      // then restore the background UNDER everything (holes and empty areas alike) —
      // the whole frame costs O(staged cells) instead of a full-document rebuild
      ctx.drawImage(art.canvas, 0, 0, size.w, size.h)
      ctx.save()
      docSpaceOn(ctx)
      if (preview.erase.length > 0) {
        const punch = new Path2D()
        for (const i of preview.erase) {
          const gx = i % bw
          const gy = (i - gx) / bw
          punch.rect(gx / doc.sub, gy / doc.sub, 1 / doc.sub, 1 / doc.sub)
        }
        ctx.globalCompositeOperation = 'destination-out'
        ctx.fill(punch)
      }
      // the background must be repainted on EVERY stroke frame: the art bitmap is
      // transparent outside the artwork, so skipping it flashes the flat app
      // background in place of the checkerboard for the whole stroke
      ctx.globalCompositeOperation = 'destination-over'
      fillBg()
      ctx.globalCompositeOperation = 'source-over'
      drawGeometry(ctx, preview.paths)
      strokeGrid()
      ctx.restore()
    } else {
      let paths = geometry.paths
      if (stCells && stCells.size > 0 && st) {
        // fallback preview (outline/metaball/texture/connector edits, non-square grids):
        // the staged delta needs global context, so rebuild the merged document
        paths = buildGeometry(st.palette ? { ...doc, palette: [...st.palette] } : doc, st).paths
      }
      ctx.save()
      docSpaceOn(ctx)
      fillBg()
      drawGeometry(ctx, paths)
      strokeGrid()
      ctx.restore()
    }
  }, [
    geometry,
    view,
    doc,
    showGrid,
    resizeCount,
    bw,
    bh,
    stage,
    resolvedTheme,
    isSquare,
    gridOverlayPath,
    gridLinePaths,
    extent,
  ])

  useEffect(() => {
    drawBase()
  }, [drawBase])
  // kept fresh for the staging rAF loop, which draws without a React re-render
  drawBaseRef.current = drawBase

  // ---- overlay render: symmetry guides, selection ants, ghost preview, hover brush ----
  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const size = sizeCanvas(canvas, wrap)
    if (!size) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)

    const W = extent.w
    const H = extent.h
    ctx.save()
    ctx.translate(view.x, view.y)
    ctx.scale(view.zoom, view.zoom)

    if (symmetry.showGuides && symmetry.mode !== 'none') {
      drawGuides({ ctx, view, theme: stage, W, H, sub: doc.sub }, symmetry)
    }

    if (reducedMotionRef.current === null) {
      reducedMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    }

    /**
     * Paint strokes onto a scratch canvas and punch the shape interior back out, so only the OUTER
     * half of every stroke survives: selection/hover outlines never cover the pixels or edges they
     * mark (the Photoshop/Illustrator practice).
     */
    const blitOutsideStrokes = (
      build: (s: CanvasRenderingContext2D) => void,
      punchPath: Path2D,
    ) => {
      let scratch = scratchRef.current
      if (!scratch) scratch = scratchRef.current = document.createElement('canvas')
      if (scratch.width !== canvas.width || scratch.height !== canvas.height) {
        scratch.width = canvas.width
        scratch.height = canvas.height
      }
      const sctx = scratch.getContext('2d')
      if (!sctx) return
      sctx.setTransform(1, 0, 0, 1, 0, 0)
      sctx.globalCompositeOperation = 'source-over'
      sctx.clearRect(0, 0, scratch.width, scratch.height)
      sctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
      sctx.save()
      sctx.translate(view.x, view.y)
      sctx.scale(view.zoom, view.zoom)
      build(sctx)
      sctx.restore()
      sctx.globalCompositeOperation = 'destination-out'
      sctx.save()
      sctx.translate(view.x, view.y)
      sctx.scale(view.zoom, view.zoom)
      sctx.fill(punchPath)
      sctx.restore()
      sctx.globalCompositeOperation = 'source-over'
      ctx.save()
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
      ctx.drawImage(scratch, 0, 0, size.w, size.h)
      ctx.restore()
    }

    // selection contour, cached; during a move drag the ants ride along with the ghost
    const selOut = selection.length > 0 ? cachedOutline(selection) : null
    const moveDrag = dragKind === 'move' && drag.current?.kind === 'move' ? drag.current : null
    const selTx = moveDrag ? (moveDrag.dx ?? 0) / doc.sub : 0
    const selTy = moveDrag ? (moveDrag.dy ?? 0) / doc.sub : 0
    if (selOut) {
      // faint tint keeps big selections findable while leaving recolors fully visible
      ctx.save()
      ctx.translate(selTx, selTy)
      ctx.globalAlpha = 0.08
      ctx.fillStyle = stage.guide
      ctx.fill(selOut.path)
      ctx.globalAlpha = 1
      ctx.restore()
      blitOutsideStrokes((s) => {
        s.save()
        s.translate(selTx, selTy)
        s.lineJoin = 'round'
        if (reducedMotionRef.current) {
          // static fallback: halo + solid core line, still fully outside the shape
          s.globalAlpha = 0.5
          s.strokeStyle = stage.hoverHalo
          s.lineWidth = 4 / view.zoom
          s.stroke(selOut.path)
          s.globalAlpha = 1
          s.strokeStyle = stage.guide
          s.lineWidth = 1.5 / view.zoom
          s.stroke(selOut.path)
        } else {
          // marching ants: faint halo under alternating white/black dashes
          s.globalAlpha = 0.5
          s.strokeStyle = stage.hoverHalo
          s.lineWidth = 4 / view.zoom
          s.stroke(selOut.path)
          s.globalAlpha = 1
          const dash = 4 / view.zoom
          const phase = ((antsOffsetRef.current * ANTS_SPEED) / 1000 / view.zoom) % (dash * 2)
          s.lineWidth = 1.5 / view.zoom
          s.setLineDash([dash, dash])
          s.strokeStyle = 'rgba(255,255,255,0.8)'
          s.lineDashOffset = -phase
          s.stroke(selOut.path)
          s.strokeStyle = 'rgba(0,0,0,0.6)'
          s.lineDashOffset = -phase + dash
          s.stroke(selOut.path)
          s.setLineDash([])
          s.lineDashOffset = 0
        }
        s.restore()
      }, selOut.path)
      // live size badge (cells) anchored to the bottom-right of the bounding box
      const label = `${Math.round((selOut.maxX - selOut.minX) * doc.sub)} × ${Math.round(
        (selOut.maxY - selOut.minY) * doc.sub,
      )}`
      const sx = view.x + (selOut.maxX + selTx) * view.zoom
      const sy = view.y + (selOut.maxY + selTy) * view.zoom
      ctx.save()
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
      ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
      const tw = ctx.measureText(label).width
      let px = sx - tw - 16
      let py = sy + 6
      if (px < 4) px = sx + 6
      if (py + 18 > size.h) py = sy - 24
      ctx.fillStyle = 'rgba(0,0,0,0.65)'
      ctx.beginPath()
      ctx.roundRect(px, py, tw + 10, 18, 5)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, px + 5, py + 9.5)
      ctx.restore()
    }
    if (hoverObj > 0 && dragKind === null && !selection.includes(hoverObj)) {
      const hov = cachedOutline([hoverObj])
      if (hov) {
        blitOutsideStrokes((s) => {
          s.lineJoin = 'round'
          s.setLineDash([3 / view.zoom, 3 / view.zoom])
          s.strokeStyle = stage.hoverHalo
          s.lineWidth = 6 / view.zoom
          s.stroke(hov.path)
          s.strokeStyle = stage.guide
          s.lineWidth = 2.5 / view.zoom
          s.stroke(hov.path)
          s.setLineDash([])
        }, hov.path)
      }
    }

    // brush footprint + symmetry ghosts under the cursor; hidden mid-stroke, where the
    // staging preview already shows the full result
    if (hover && dragKind === null && tool !== 'picker' && tool !== 'select') {
      const foot = new Path2D()
      const ghosts = new Path2D()
      let hasGhosts = false
      const singleCell = tool === 'fill' || tool === 'connector'
      const cellRects = (idx: number, into: Path2D) => {
        if (isSquare) {
          const gx = idx % bw
          const gy = Math.floor(idx / bw)
          into.rect(gx / doc.sub, gy / doc.sub, 1 / doc.sub, 1 / doc.sub)
        } else {
          polyPath(into, grid.polygon(idx))
        }
      }
      if (singleCell) {
        // fill over a selected shape re-fills the whole selection: preview that region
        const fillHitObj = tool === 'fill' && hover ? (doc.cellObj?.[hover.idx] ?? 0) : 0
        const selFoot =
          fillHitObj > 0 && selection.includes(fillHitObj) ? (selOut?.path ?? null) : null
        if (selFoot) {
          foot.addPath(selFoot)
        } else {
          cellRects(hover.idx, foot)
          if (tool === 'fill' && symmetry.mode !== 'none') {
            for (const si of expand(hover.idx)) {
              if (si === hover.idx) continue
              cellRects(si, ghosts)
              hasGhosts = true
            }
          }
        }
      } else if (isSquare) {
        const bx = hover.idx % bw
        const by = Math.floor(hover.idx / bw)
        const [ax, ay] = brushAnchor(bx, by, brush.size, brushSnap)
        const orbit =
          symmetry.mode === 'none'
            ? [[ax, ay]]
            : symmetryPoints(ax, ay, bw, bh, symmetry.mode, symmetry.n, symmetry.cell, radialOpts)
        // symmetryPoints lists the anchor first; the remaining copies are ghosts
        orbit.forEach(([ox, oy], oi) => {
          for (const [dx, dy] of tipOffsets) {
            const x = ox + dx
            const y = oy + dy
            if (x < 0 || y < 0 || x >= bw || y >= bh) continue
            if (oi === 0) foot.rect(x / doc.sub, y / doc.sub, 1 / doc.sub, 1 / doc.sub)
            else {
              ghosts.rect(x / doc.sub, y / doc.sub, 1 / doc.sub, 1 / doc.sub)
              hasGhosts = true
            }
          }
        })
      } else {
        const blob = blobCells(grid, hover.idx, brush.size * brush.size)
        for (const bi of blob) {
          polyPath(foot, grid.polygon(bi))
          if (symmetry.mode !== 'none') {
            for (const si of expand(bi)) {
              if (si === bi) continue
              polyPath(ghosts, grid.polygon(si))
              hasGhosts = true
            }
          }
        }
      }
      if (hasGhosts && (tool === 'pencil' || tool === 'eraser' || tool === 'fill')) {
        ctx.globalAlpha = tool === 'eraser' ? 0.22 : 0.35
        ctx.fillStyle = tool === 'eraser' ? stage.hover : color
        ctx.fill(ghosts)
        ctx.globalAlpha = 1
      }
      // translucent fill of what a click would paint plus a screen-constant
      // halo + core outline that reads on any background
      if (
        tool === 'pencil' ||
        tool === 'fill' ||
        tool === 'line' ||
        tool === 'rect' ||
        tool === 'ellipse' ||
        tool === 'connector' ||
        isShapeTool(tool)
      ) {
        ctx.globalAlpha = 0.4
        ctx.fillStyle = color
        ctx.fill(foot)
        ctx.globalAlpha = 1
      } else if (tool === 'eraser') {
        ctx.globalAlpha = 0.3
        ctx.fillStyle = stage.hover
        ctx.fill(foot)
        ctx.globalAlpha = 1
      }
      ctx.lineJoin = 'round'
      ctx.strokeStyle = stage.hoverHalo
      ctx.lineWidth = 4 / view.zoom
      ctx.stroke(foot)
      ctx.strokeStyle = stage.hover
      ctx.lineWidth = 1.75 / view.zoom
      ctx.stroke(foot)
    }
    ctx.restore()

    ctx.strokeStyle = stage.frame
    ctx.lineWidth = 1
    ctx.strokeRect(view.x - 0.5, view.y - 0.5, W * view.zoom + 1, H * view.zoom + 1)
  }, [
    hover,
    hoverObj,
    dragKind,
    tool,
    color,
    brush,
    brushSnap,
    tipOffsets,
    symmetry,
    view,
    doc,
    resizeCount,
    bw,
    bh,
    stage,
    resolvedTheme,
    isSquare,
    grid,
    gridOverlayPath,
    extent,
    expand,
    cachedOutline,
    selection,
  ])

  useEffect(() => {
    drawOverlay()
  }, [drawOverlay])
  // kept fresh for the ants rAF loop, which draws without a React re-render
  drawOverlayRef.current = drawOverlay

  // marching ants animation: a rAF loop only while a selection exists, writing the dash
  // phase to a ref and redrawing the overlay directly (no per-frame React render)
  useEffect(() => {
    if (selection.length === 0) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      // wrap at 60 s: 60000 ms * ANTS_SPEED is a whole number of dash periods,
      // so the phase wraps without a visible jump
      antsOffsetRef.current = (now - start) % 60_000
      drawOverlayRef.current()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [selection])

  const cursor = panning || spaceDown ? 'grabbing' : tool === 'select' ? 'default' : 'crosshair'

  // ---- overlay scrollbars: the track maps the canvas extent, the thumb mirrors the viewport ----
  const vwDoc = wrapSize.w / view.zoom
  const vhDoc = wrapSize.h / view.zoom
  const hVisible = wrapSize.w > 0 && vwDoc < extent.w - 1e-6
  const vVisible = wrapSize.h > 0 && vhDoc < extent.h - 1e-6
  const hBar = scrollbarMetrics(
    extent.w,
    -view.x / view.zoom,
    vwDoc,
    wrapSize.w - (vVisible ? SCROLLBAR : 0),
  )
  const vBar = scrollbarMetrics(
    extent.h,
    -view.y / view.zoom,
    vhDoc,
    wrapSize.h - (hVisible ? SCROLLBAR : 0),
  )

  const thumbDown = (axis: 'x' | 'y', scale: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    scrollDrag.current = {
      axis,
      startPx: axis === 'x' ? e.clientX : e.clientY,
      startView: axis === 'x' ? view.x : view.y,
      scale,
    }
  }
  const thumbMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = scrollDrag.current
    if (!d) return
    const px = d.axis === 'x' ? e.clientX : e.clientY
    const delta = (px - d.startPx) / d.scale
    if (d.axis === 'x') setView((v) => ({ ...v, x: d.startView - delta * v.zoom }))
    else setView((v) => ({ ...v, y: d.startView - delta * v.zoom }))
  }
  const thumbUp = () => {
    scrollDrag.current = null
  }
  const trackDown =
    (axis: 'x' | 'y', scale: number, viewportDoc: number) =>
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const px = axis === 'x' ? e.clientX - rect.left : e.clientY - rect.top
      const newStart = px / scale - viewportDoc / 2
      if (axis === 'x') setView((v) => ({ ...v, x: -newStart * v.zoom }))
      else setView((v) => ({ ...v, y: -newStart * v.zoom }))
    }

  return (
    <div
      ref={wrapRef}
      className="bg-app relative min-w-0 flex-1 overflow-hidden"
      onDragOver={(e) => {
        if (!onDropFile || !e.dataTransfer?.types.includes('Files')) return
        e.preventDefault()
        setImportDragOver(true)
      }}
      onDragLeave={() => setImportDragOver(false)}
      onDrop={(e) => {
        setImportDragOver(false)
        if (!onDropFile) return
        const file = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'))
        if (!file) return
        e.preventDefault()
        onDropFile(file)
      }}
    >
      {importDragOver && (
        <div className="border-accent-line bg-accent-soft/40 text-accent-text pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-xl border-2 border-dashed text-xs font-medium backdrop-blur-sm">
          {t('import.pick')}
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{ cursor }}
        className="absolute inset-0 touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHover(null)}
      />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 touch-none" />
      {pendingLink && (
        <div className="border-line bg-panel text-body pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded-full border px-3 py-1 text-xs backdrop-blur">
          {t('view.linkPending')}
        </div>
      )}
      {scopeHint && (
        <div className="border-line bg-panel text-body absolute top-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs shadow-lg">
          <span>{t('select.scopeHint')}</span>
          <button
            type="button"
            onClick={() => {
              setStyleScope('element')
              setScopeHint(false)
            }}
            className="border-accent-line bg-accent-soft text-accent-text hover:border-accent-text rounded border px-1.5 py-0.5 transition"
          >
            {t('select.scopeHint.action')}
          </button>
          <button
            type="button"
            onClick={() => setScopeHint(false)}
            aria-label={t('preview.close')}
            className="text-muted hover:text-body transition"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      )}
      <ZoomControls
        hoverText={
          hover
            ? `${
                isSquare
                  ? `x:${Math.floor((hover.idx % bw) / doc.sub)} y:${Math.floor(Math.floor(hover.idx / bw) / doc.sub)} · `
                  : ''
              }i:${hover.idx}`
            : null
        }
        zoom={view.zoom}
        setView={setView}
        wrap={wrapRef.current}
      />

      {/* fit canvas — bottom-left overlay (moved from the top bar) */}
      <button
        type="button"
        onClick={fit}
        title={`${t('top.fit')} (F)`}
        className="text-label absolute bottom-3 left-3 z-10 flex items-center gap-1.5 rounded-md bg-black/50 px-2.5 py-1.5 text-white/80 backdrop-blur-sm transition hover:bg-black/70 hover:text-white"
      >
        <svg
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        >
          <path d="M2 5.5v-2A1.5 1.5 0 013.5 2h2" />
          <path d="M10.5 2h2A1.5 1.5 0 0114 3.5v2" />
          <path d="M14 10.5v2a1.5 1.5 0 01-1.5 1.5h-2" />
          <path d="M5.5 14h-2A1.5 1.5 0 012 12.5v-2" />
          <path d="M6.25 6.25h3.5v3.5h-3.5z" />
        </svg>
        {t('top.fit')}
      </button>
      {hBar.visible && (
        <div
          aria-label={t('view.scrollX')}
          className="bg-chip absolute bottom-0 left-0 touch-none rounded-tl-md"
          style={{ height: SCROLLBAR, width: wrapSize.w - (vVisible ? SCROLLBAR : 0) }}
          onPointerDown={trackDown('x', hBar.scale, vwDoc)}
        >
          <div
            aria-label={t('view.scrollX')}
            className="bg-muted/40 hover:bg-muted/70 active:bg-muted absolute rounded-full transition-colors"
            style={{
              left: hBar.thumbPos,
              width: hBar.thumbLen,
              top: 1,
              height: SCROLLBAR - 2,
              cursor: 'grab',
            }}
            onPointerDown={thumbDown('x', hBar.scale)}
            onPointerMove={thumbMove}
            onPointerUp={thumbUp}
            onPointerCancel={thumbUp}
          />
        </div>
      )}
      {vBar.visible && (
        <div
          aria-label={t('view.scrollY')}
          className="bg-chip absolute top-0 right-0 touch-none rounded-bl-md"
          style={{ width: SCROLLBAR, height: wrapSize.h - (hVisible ? SCROLLBAR : 0) }}
          onPointerDown={trackDown('y', vBar.scale, vhDoc)}
        >
          <div
            aria-label={t('view.scrollY')}
            className="bg-muted/40 hover:bg-muted/70 active:bg-muted absolute rounded-full transition-colors"
            style={{
              top: vBar.thumbPos,
              height: vBar.thumbLen,
              left: 1,
              width: SCROLLBAR - 2,
              cursor: 'grab',
            }}
            onPointerDown={thumbDown('y', vBar.scale)}
            onPointerMove={thumbMove}
            onPointerUp={thumbUp}
            onPointerCancel={thumbUp}
          />
        </div>
      )}
    </div>
  )
}
