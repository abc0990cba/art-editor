import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'

import { STAGE_THEMES, docExtent } from '../../engine/core/doc.ts'
import { nodeProtected, objLayer, type SceneLayer } from '../../engine/core/scene.ts'
import { scrollbarMetrics } from '../../engine/core/scrollbars.ts'
import { selectionBox, type CellBox } from '../../engine/effects/selection-xform.ts'
import { buildGeometry } from '../../engine/geometry/index.ts'
import { cellCoordLabel } from '../../engine/grids/index.ts'
import { isShapeTool } from '../../engine/shapes/index.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { FitCanvasButton } from '../../shared/ui/fit-button.component.tsx'
import { ZoomControls } from '../../shared/ui/zoom-controls.component.tsx'
import { useStore } from '../../state/editor.store.ts'
import {
  ANTS_SPEED,
  SCROLLBAR,
  constrainShapeEnd,
  drawGuides,
  drawMarquee,
  marqueeRect,
  objectsInMarquee,
  rectHasInk,
  sizeCanvas,
  type DragState,
  type Hover,
} from './canvas-stage.util.ts'
import { viewOffscreen } from './canvas-view-math.util.ts'
import { diffusionContourPath, hoverCellCenter, strokeKernelRing } from './diffusion-guides.util.ts'
import { drawToolHover } from './draw-tool-hover.util.ts'
import { cellPolygonOverlayPath, squareGridLines } from './grid-overlay.util.ts'
import { clickSelectionIds } from './select-hit.util.ts'
import { SelectionActions } from './selection-actions.component.tsx'
import { cursorForHandle, drawTransformBox } from './selection-transform.util.ts'
import { paintStage } from './stage-paint-frame.util.ts'
import { createStagePaintState, type StagePaintState } from './stage-paint.util.ts'
import { useCanvasStaging } from './use-canvas-staging.hook.ts'
import { useCanvasView } from './use-canvas-view.hook.ts'
import { useOutlineCache } from './use-outline-cache.hook.ts'
import { useSelectionTransform } from './use-selection-transform.hook.ts'

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
  const gridEmphasis = useStore((s) => s.gridEmphasis)
  const showDiffusionGuides = useStore((s) => s.showDiffusionGuides)
  const fillAt = useStore((s) => s.fillAt)
  const paintFillRegion = useStore((s) => s.paintFillRegion)
  const addLinks = useStore((s) => s.addLinks)
  const setColor = useStore((s) => s.setColor)
  const shapePaint = useStore((s) => s.shapePaint)
  const fillStyle = useStore((s) => s.fillStyle)
  const selection = useStore((s) => s.selection)
  const selectElements = useStore((s) => s.selectElements)
  const removeFromSelection = useStore((s) => s.removeFromSelection)
  const clearSelection = useStore((s) => s.clearSelection)
  const moveSelection = useStore((s) => s.moveSelection)
  const fillSelection = useStore((s) => s.fillSelection)
  const activeLayerId = useStore((s) => s.activeLayerId)
  const setActiveLayer = useStore((s) => s.setActiveLayer)

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  // cached artwork + baked background/grid/stroke layers (see stage-paint.util)
  const paintRef = useRef<StagePaintState | null>(null)
  if (!paintRef.current) paintRef.current = createStagePaintState()
  // scratch canvas for outside-only selection/hover strokes (marching ants)
  const scratchRef = useRef<HTMLCanvasElement | null>(null)
  // ants dash phase (screen px); driven by a rAF loop without re-rendering React
  const antsOffsetRef = useRef(0)
  const drawOverlayRef = useRef<() => void>(() => {})
  // kept fresh for the staging rAF loop, which draws without a React re-render
  const drawBaseRef = useRef<() => void>(() => {})
  // registered once below; the live body sees the current view/doc without re-observing
  const resizeRef = useRef<() => void>(() => {})
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

  // memoized identity: a fresh object per render would re-run the draw effects on every
  // hover tick (each hover cell change re-renders the stage)
  const extent = useMemo(() => docExtent(doc), [doc])

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

  const {
    stagingRef,
    frameDeltaRef,
    bumpStaging,
    scheduleStaging,
    ensureStaging,
    expand,

    connectorCopies,

    stampBrush,

    stampStrokeLine,
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
    // stroke frames draw imperatively: staging rAF → direct base redraw (the overlay only
    // follows drags whose on-screen guides move: selection move and transform ghosts)
    onStagingFrame: () => {
      drawBaseRef.current()
      const k = drag.current?.kind
      if (k === 'move' || k === 'xform') drawOverlayRef.current()
    },
  })

  // committed geometry only: during strokes the base layer composites the staged delta
  // on top of a cached artwork bitmap (see the base render effect), so the full-document
  // rebuild runs on doc changes — not on every rAF tick of a stroke
  const geometry = useMemo(() => buildGeometry(doc), [doc])

  const [hover, setHover] = useState<Hover | null>(null)
  const drag = useRef<DragState | null>(null)
  // cursor of the hovered transform handle (state only flips when the value changes)
  const [handleCursor, setHandleCursor] = useState<string | null>(null)
  // marquee frames coalesce into one overlay redraw per frame (the base layer never changes)
  const marqueeRafRef = useRef(0)
  const scheduleMarquee = useCallback(() => {
    if (!marqueeRafRef.current) {
      marqueeRafRef.current = requestAnimationFrame(() => {
        marqueeRafRef.current = 0
        drawOverlayRef.current()
      })
    }
  }, [])
  useEffect(() => () => cancelAnimationFrame(marqueeRafRef.current), [])
  // buffer-space bbox of the selection's ink — drives the transform box and its handles
  const selCellBox = useMemo<CellBox | null>(
    () =>
      isSquare && selection.length > 0 && doc.cellObj
        ? selectionBox(doc.cells, doc.cellObj, selection, bw, bh)
        : null,
    [isSquare, selection, doc, bw],
  )
  const xform = useSelectionTransform(doc, selection, selCellBox, doc.sub, {
    ensureStaging,
    scheduleStaging,
  })
  const xformCancelRef = useRef<() => void>(xform.cancel)

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

  // shared cancel of any in-flight gesture (stroke, transform, connector preview, staging):
  // used by the pinch landing and Escape, lives in the view hook
  const cancelGestureRef = useRef<() => void>(() => {})
  cancelGestureRef.current = () => {
    drag.current = null
    xformCancelRef.current()
    shapeStartRef.current = null
    shapeLastRef.current = null
    setPendingLink(null)
    if (stagingRef.current) {
      stagingRef.current = null
      bumpStaging()
    }
  }

  // wheel / pinch / view keys live in the extracted navigation hook
  useCanvasView({
    wrapRef,
    viewRef,
    setView,
    spaceRef,
    onSpaceChange: setSpaceDown,
    cancelGestureRef,
    clearSelection,
  })

  // wrap resize (browser zoom, panel toggles, node-editor split): redraw + scrollbar
  // metrics — and if the artwork ended up fully out of view, fit it back so the user
  // never faces an empty wrap; never mid-gesture, never on a collapsed pane
  resizeRef.current = () => {
    const el = wrapRef.current
    if (!el) return
    bumpResize()
    setWrapSize({ w: el.clientWidth, h: el.clientHeight })
    if (
      el.clientWidth > 0 &&
      el.clientHeight > 0 &&
      !drag.current &&
      !stagingRef.current &&
      viewOffscreen(viewRef.current, extent.w, extent.h, el.clientWidth, el.clientHeight)
    ) {
      fit()
    }
  }
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => resizeRef.current())
    ro.observe(el)
    resizeRef.current()
    return () => ro.disconnect()
  }, [resizeRef, wrapRef])

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
  // commits through moveSelection instead of the paint path; a marquee drag
  // resolves the rubber band into element ids (add/subtract per its modifiers).
  const finishDragRef = useRef<() => void>(() => {})
  /** A scene object the select tool may pick: visible, not locked, not under a locked parent. */
  const pickableObj = useCallback(
    (id: number): boolean => id > 0 && !(doc.layers && nodeProtected(doc.layers, id)),
    [doc.layers],
  )
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
    if (d.kind === 'xform') {
      stagingRef.current = null
      bumpStaging()
      xform.finish()
      return
    }
    if (d.kind === 'marquee') {
      if (marqueeRafRef.current) {
        cancelAnimationFrame(marqueeRafRef.current)
        marqueeRafRef.current = 0
      }
      if (d.start && d.end) {
        const rect = marqueeRect({ x: d.start[0], y: d.start[1] }, d.end)
        const hits = objectsInMarquee(doc, rect, pickableObj)
        if (d.subtractive) removeFromSelection(hits)
        else if (d.additive) selectElements([...selection, ...hits])
        else {
          selectElements(hits)
          // the band covered painted artwork yet picked nothing: canvas-wide styles keep
          // cellObj empty — surface why instead of failing silently (same as a bare click)
          if (
            hits.length === 0 &&
            doc.styleScope === 'global' &&
            rectHasInk(doc.cells, bw, bh, doc.sub, rect)
          ) {
            showScopeHint()
          }
        }
      }
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
  /** Select-tool press: group-aware pick, Shift/Alt add/remove, empty space starts a marquee. */
  const beginSelect = (
    e: React.PointerEvent<HTMLCanvasElement>,
    p: { x: number; y: number },
    idx: number,
  ) => {
    // a grab of a transform-box handle (or its rotate zone) wins over everything else
    if (selection.length > 0) {
      const hit = xform.hit(p, view.zoom, e.pointerType === 'touch')
      if (hit && xform.begin(hit.kind, hit.handle, p)) {
        drag.current = { kind: 'xform', sx: p.x, sy: p.y }
        setDragKind('xform')
        return
      }
    }
    // locked or hidden-ancestor objects are not pickable
    const rawObj = idx >= 0 ? (doc.cellObj?.[idx] ?? 0) : 0
    const obj = pickableObj(rawObj) ? rawObj : 0
    if (obj > 0 && e.shiftKey) {
      // Shift adds/toggles the clicked entity — the whole group is the click unit
      const ids = clickSelectionIds(doc, obj)
      if (ids.some((id) => selection.includes(id))) removeFromSelection(ids)
      else selectElements([...selection, ...ids])
      return
    }
    if (obj > 0) {
      const ids = clickSelectionIds(doc, obj)
      const already = ids.every((id) => selection.includes(id))
      if (e.altKey) {
        // Alt+drag clones the selection and moves the clones (Illustrator option-drag);
        // a plain Alt+click leaves both copies in place — undo reverts it
        useStore.getState().duplicateSelection()
      } else if (!already) {
        selectElements(ids)
      }
      // clicking an object makes its layer the active one
      if (doc.layers) {
        const layerId = objLayer(doc.layers, obj)?.id
        if (layerId != null && layerId !== activeLayerId) setActiveLayer(layerId)
      }
      const st = useStore.getState()
      const sel = e.altKey ? st.selection : already ? selection : ids
      const snapDoc = st.doc
      // snapshot the selected cells so the drag preview knows what moves
      let moved: [number, number, number][] = []
      if (isSquare && snapDoc.cellObj) {
        moved = []
        for (let i = 0; i < snapDoc.cellObj.length; i++) {
          const o = snapDoc.cellObj[i]
          if (o > 0 && sel.includes(o) && snapDoc.cells[i] > 0) moved.push([i, snapDoc.cells[i], o])
        }
      }
      drag.current = { kind: 'move', sx: p.x, sy: p.y, moved, dx: 0, dy: 0 }
      setDragKind('move')
      return
    }
    // empty space: a plain click clears, Shift/Alt keep the selection and stretch an
    // additive/subtractive rubber band; everything inside becomes selected on release
    if (!e.shiftKey && !e.altKey) clearSelection()
    drag.current = {
      kind: 'marquee',
      sx: p.x,
      sy: p.y,
      start: [p.x, p.y],
      additive: e.shiftKey,
      subtractive: e.altKey,
    }
    setDragKind('marquee')
    // artwork is there but unselectable: canvas-wide styles keep cellObj empty,
    // so a select click would do nothing — surface why instead of staying silent
    if (doc.styleScope === 'global' && idx >= 0 && doc.cells[idx] > 0) showScopeHint()
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* synthetic pointers have no active id — drawing still works uncaptured */
    }
    // middle/right button, held Space or the hand tool all pan instead of drawing
    if (e.button === 1 || e.button === 2 || spaceRef.current || tool === 'hand') {
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
    // shape drags only record their start point; the preview builds in onPointerMove
    if (tool === 'line' || tool === 'rect' || tool === 'ellipse' || isShapeTool(tool)) {
      if (!drawBlocked) {
        drag.current = { kind: 'shape', start: [p.x, p.y] }
        shapeStartRef.current = [p.x, p.y]
        shapeLastRef.current = [p.x, p.y]
        setDragKind('shape')
      }
      return
    }
    switch (tool) {
      case 'select': {
        beginSelect(e, p, idx)
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
    // hover state re-renders the whole stage — wasted during a stroke, where the overlay
    // shows the drag instead of the hover preview; the next plain move refreshes it
    if (!drag.current) {
      setHover((prev) => {
        if (idx >= 0) return prev?.idx === idx ? prev : { idx }
        return prev === null ? prev : null
      })
    }
    const d = drag.current
    if (!d) {
      // transform-handle hover cursors, set imperatively-cheap: the state only flips
      // when the cursor value itself changes, so this costs nothing between handles
      if (tool === 'select' && p) {
        const c = cursorForHandle(xform.hit(p, viewRef.current.zoom, e.pointerType === 'touch'))
        setHandleCursor((prev) => (prev === c ? prev : c))
      }
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
      let ndx = Math.round(p.x - d.sx!)
      let ndy = Math.round(p.y - d.sy!)
      // Shift locks the drag to the dominant axis — straight horizontal/vertical moves
      if (e.shiftKey) {
        if (Math.abs(ndx) >= Math.abs(ndy)) ndy = 0
        else ndx = 0
      }
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
    if (d.kind === 'xform') {
      // live scale/rotate ghost: staged cells repaint per frame via the staging loop
      if (p) xform.update(p, e)
      return
    }
    if (d.kind === 'marquee') {
      // live rubber band: overlay-only redraw (rAF-coalesced), the base never changes
      if (!p) return
      d.end = p
      scheduleMarquee()
      return
    }
    if (!p) return
    if (d.kind === 'draw') {
      if (d.last !== idx) {
        // stamp every cell the pointer crossed, so fast drags stay continuous
        stampStrokeLine(d.last ?? -1, idx, { erase: tool === 'eraser', free: e.altKey }, d, p)
        d.last = idx
      }
      return
    }
    if (d.kind === 'shape') {
      // Shift constrains the drag: 45° steps for the line, a 1:1 box for 2D shapes
      const startPt = { x: d.start![0], y: d.start![1] }
      const cp = e.shiftKey ? constrainShapeEnd(tool, startPt, p) : p
      shapeLastRef.current = [cp.x, cp.y]
      stampShape(startPt, cp, e.altKey)
    }
  }

  const onPointerUp = () => {
    finishDragRef.current()
  }

  // cancel a pending connector when the tool changes
  useEffect(() => {
    if (tool !== 'connector' && pendingLink) {
      setPendingLink(null)
      stagingRef.current = null
      bumpStaging()
    }
  }, [tool, pendingLink])

  // cached overlay path of every cell polygon (non-square grids)
  const gridOverlayPath = useMemo(
    () => (isSquare ? null : cellPolygonOverlayPath(grid)),
    [isSquare, grid],
  )

  // diffusion aids active only while metaball mode renders (guides toggle)
  const showDiffusion = showDiffusionGuides && doc.renderMode === 'metaball'

  // square-grid lines + diffusion half-pitch, prebuilt and rebuilt only when the grid changes
  const gridLinePaths = useMemo(
    () =>
      isSquare
        ? squareGridLines({
            bw,
            bh,
            sub: doc.sub,
            w: extent.w,
            h: extent.h,
            emphasis: gridEmphasis,
            half: showDiffusion,
          })
        : null,
    [isSquare, bw, bh, doc.sub, extent.w, extent.h, gridEmphasis, showDiffusion],
  )

  // dashed threshold contour of the merged metaball field (diffusion guides)
  const contourPath = useMemo(
    () => (showDiffusion ? diffusionContourPath(doc) : null),
    [showDiffusion, doc],
  )

  // selection/hover contours (marching squares over the owned cells), cached per doc
  const cachedOutline = useOutlineCache(doc, bw, bh)

  const hoverObj = hover && tool === 'select' ? (doc.cellObj?.[hover.idx] ?? 0) : 0

  // ---- base layer render: cached artwork blit + staged delta composite + baked grid ----
  // The whole frame lives in stage-paint.util: pencil/eraser frames render only the newly
  // staged cells into a persistent stroke layer (O(new cells) per frame), shape/move ghosts of
  // plain-square docs blit a 1-px-per-cell bitmap, and everything else takes the legacy path —
  // all on top of baked background/grid layers that rebuild only when their inputs change.
  const drawBase = useCallback(() => {
    paintStage({
      canvas: canvasRef.current,
      wrap: wrapRef.current,
      state: paintRef.current!,
      doc,
      geometry,
      view,
      extent,
      stage,
      resolvedTheme,
      showGrid,
      gridLinePaths,
      gridOverlayPath,
      contourPath,
      showDiffusion,
      tool,
      isDrawStroke: drag.current?.kind === 'draw',
      staging: stagingRef,
      delta: frameDeltaRef,
      bw,
      bh,
    })
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
    tool,
    isSquare,
    gridOverlayPath,
    gridLinePaths,
    contourPath,
    showDiffusion,
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
    // live marquee rubber band: translucent fill + hairline border, screen-constant stroke
    const mq = dragKind === 'marquee' && drag.current?.kind === 'marquee' ? drag.current : null
    if (mq) drawMarquee(ctx, mq, stage, view.zoom)
    // Illustrator-style transform box: live geometry while a scale/rotate drag runs, the
    // committed box otherwise; hidden during move/marquee drags (the ghost tells the story)
    if (
      tool === 'select' &&
      isSquare &&
      selCellBox &&
      (dragKind === null || dragKind === 'xform')
    ) {
      drawTransformBox(
        ctx,
        dragKind === 'xform' ? xform.live() : null,
        xform.box!,
        stage,
        view.zoom,
      )
    }
    // hover previews exactly what a click would pick: the whole group (see clickSelectionIds)
    const hoverIds = hoverObj > 0 ? clickSelectionIds(doc, hoverObj) : null
    if (hoverIds && dragKind === null && !hoverIds.some((id) => selection.includes(id))) {
      const hov = cachedOutline(hoverIds)
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
    if (hover && dragKind === null && tool !== 'picker' && tool !== 'select' && tool !== 'hand') {
      drawToolHover({
        ctx,
        zoom: view.zoom,
        hoverIdx: hover.idx,
        tool,
        color,
        brushSize: brush.size,
        brushSnap,
        isSquare,
        grid,
        bw,
        bh,
        sub: doc.sub,
        cellObj: doc.cellObj,
        tipOffsets,
        symmetry,
        radialOpts,
        expand,
        selection,
        selOutPath: selOut?.path ?? null,
        theme: stage,
      })
      // fusion reach: kernel-radius ring around the hovered cell while painting metaballs
      if (showDiffusion) {
        const c = hoverCellCenter(hover.idx, bw, doc.sub, grid, isSquare)
        strokeKernelRing(ctx, c, view.zoom, doc, stage)
      }
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
    showDiffusion,
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

  const cursor =
    panning || spaceDown
      ? 'grabbing'
      : tool === 'hand'
        ? 'grab'
        : (handleCursor ?? (tool === 'select' ? 'default' : 'crosshair'))

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

  // contextual action bar above the transform box (duplicate / flips / 90° / delete)
  const actionsVisible =
    tool === 'select' && dragKind === null && selCellBox !== null && xform.box !== null
  const actionsPos = (() => {
    if (!actionsVisible || !xform.box) return null
    const b = xform.box
    const x = Math.min(Math.max(4, view.x + b.x0 * view.zoom), Math.max(4, wrapSize.w - 244))
    let y = view.y + b.y0 * view.zoom - 46
    if (y < 4) y = view.y + b.y1 * view.zoom + 10
    return { x, y: Math.min(y, Math.max(4, wrapSize.h - 52)) }
  })()

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
      // right-drag pans (like Figma/Blender); the context menu has no use over the canvas
      onContextMenu={(e) => e.preventDefault()}
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
      {actionsPos && (
        <SelectionActions
          x={actionsPos.x}
          y={actionsPos.y}
          staging={{ ensureStaging, scheduleStaging }}
        />
      )}
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
        hoverText={hover ? cellCoordLabel(grid, hover.idx, isSquare ? bw : 0) : null}
        zoom={view.zoom}
        setView={setView}
        wrap={wrapRef.current}
      />

      {/* fit canvas — bottom-left overlay, styled like the zoom plate next to which it sits */}
      <FitCanvasButton onFit={fit} label={t('top.fit')} title={`${t('top.fit')} (F)`} />
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
