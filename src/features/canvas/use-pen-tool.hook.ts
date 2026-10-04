import { useCallback, useEffect, useRef } from 'react'

import type { Doc, SymmetryState } from '../../engine/core/doc.ts'
import {
  bendSegment,
  constrainPoint,
  hitPen,
  insertAnchor,
  makeAnchor,
  moveAnchor,
  pathFromD,
  setHandle,
  toggleSmooth,
  type CurvePath,
  type PenHit,
  type Pt,
} from '../../engine/curves/index.ts'
import { PENDING_OBJ, type Staging } from '../../engine/geometry/index.ts'
import type { Grid } from '../../engine/grids/index.ts'
import { useStore } from '../../state/editor.store.ts'
import type { DocPoint } from './canvas-stage.util.ts'
import { buildPenInk, snapHandle15, snapPenAnchor } from './pen-ink.util.ts'
import {
  bezierSourceOf,
  PEN_HIT_PX,
  PEN_HIT_TOUCH_PX,
  type PenOverlayInput,
} from './stage-pen.util.ts'
import { usePenActions } from './use-pen-actions.hook.ts'

/** Hook inputs from the stage; read fresh through a ref inside every handler. */
export interface PenToolParams {
  doc: Doc
  isSquare: boolean
  grid: Grid
  bw: number
  bh: number
  symmetry: SymmetryState
  /** Symmetry orbit of one cell (pen ink expands through it like every stamping tool) */
  expand: (idx: number) => number[]
  stagingRef: { current: Staging | null }
  ensureStaging: () => Staging
  scheduleStaging: () => void
  bumpStaging: () => void
  /** RAF-coalesced overlay redraw (the pen skeleton lives there) */
  scheduleOverlay: () => void
}

/** A pen pointer gesture in progress (down → move → up). */
interface PenGesture {
  kind: 'add' | 'anchor' | 'handle' | 'bend'
  down: Pt
  start: CurvePath
  anchor?: number
  which?: 'in' | 'out'
  seg?: number
  /** 'add': the anchor has been appended during this drag (smooth point in the making) */
  created?: boolean
  /** 'add' working path: g.start plus the new anchor, handles updated per move */
  work?: CurvePath
}

/** Mutable state shared by the gesture factories and the actions hook. */
export interface PenCtx {
  paramsRef: { current: PenToolParams }
  gesture: { current: PenGesture | null }
  cursorRef: { current: Pt | null }
  hoverRef: { current: PenHit | null }
  shiftRef: { current: boolean }
  pendingPath: { current: CurvePath | null }
  schedule: () => void
  /** Synchronous draft application for terminal gestures (clicks, pointerup) — no frame wait. */
  apply: (path: CurvePath) => void
}

/** Hit tolerance in doc units for the current pointer type (touch doubles the radius). */
function hitTol(touch: boolean, zoom: number): number {
  return (touch ? PEN_HIT_TOUCH_PX : PEN_HIT_PX) / zoom
}

/** Pointerdown: hit-priority dispatch — handle, anchor (close on the first), segment, add. */
function makePointerDown(ctx: PenCtx) {
  return (
    e: { pointerType: string; altKey: boolean; shiftKey: boolean },
    point: DocPoint,
    zoom: number,
  ): void => {
    const p = ctx.paramsRef.current
    const s = useStore.getState()
    ctx.shiftRef.current = e.shiftKey
    ctx.cursorRef.current = [point.x, point.y]
    const D = s.pen
    if (!D || D.path.anchors.length === 0) {
      if (!D) s.beginPen()
      const down = snapPenAnchor([point.x, point.y], p.doc.sub, p.doc.cols, p.doc.rows, e.altKey)
      ctx.gesture.current = {
        kind: 'add',
        down,
        start: useStore.getState().pen!.path,
        created: false,
      }
      p.scheduleOverlay()
      return
    }
    const hit = hitPen(D.path, point.x, point.y, hitTol(e.pointerType === 'touch', zoom))
    if (hit?.kind === 'handle') {
      s.patchPen({ selected: hit.i })
      ctx.gesture.current = {
        kind: 'handle',
        down: [point.x, point.y],
        start: D.path,
        anchor: hit.i,
        which: hit.which,
      }
    } else if (hit?.kind === 'anchor') {
      if (hit.i === 0 && D.path.anchors.length >= 2 && !D.path.closed) {
        // click the first anchor to close (Illustrator); the preview shows the loop at once
        ctx.apply({ ...D.path, closed: true })
        p.scheduleOverlay()
        return
      }
      s.patchPen({ selected: hit.i })
      ctx.gesture.current = {
        kind: 'anchor',
        down: [point.x, point.y],
        start: D.path,
        anchor: hit.i,
      }
    } else if (hit?.kind === 'segment') {
      ctx.gesture.current = { kind: 'bend', down: [point.x, point.y], start: D.path, seg: hit.seg }
    } else {
      if (D.path.closed) s.beginPen()
      const down = snapPenAnchor([point.x, point.y], p.doc.sub, p.doc.cols, p.doc.rows, e.altKey)
      ctx.gesture.current = {
        kind: 'add',
        down,
        start: useStore.getState().pen!.path,
        created: false,
      }
    }
    p.scheduleOverlay()
  }
}

/** Pointermove: rubber band + hover tracking between clicks, live editing during a gesture. */
function makePointerMove(ctx: PenCtx) {
  return (
    e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
    point: DocPoint,
    zoom: number,
  ): void => {
    ctx.shiftRef.current = e.shiftKey
    ctx.cursorRef.current = [point.x, point.y]
    const g = ctx.gesture.current
    const D = useStore.getState().pen
    if (!g || !D) {
      ctx.hoverRef.current = D?.path ? hitPen(D.path, point.x, point.y, hitTol(false, zoom)) : null
      ctx.paramsRef.current.scheduleOverlay()
      return
    }
    ctx.hoverRef.current = null
    if (g.kind === 'add') {
      moveAddGesture(ctx, g, e, point, zoom)
    } else if (g.kind === 'anchor' && g.anchor != null) {
      ctx.pendingPath.current = moveAnchor(g.start, g.anchor, point.x, point.y)
    } else if (g.kind === 'handle' && g.anchor != null && g.which) {
      const a = g.start.anchors[g.anchor]
      const raw: Pt = [point.x, point.y]
      const h = e.ctrlKey || e.metaKey ? snapHandle15([a.x, a.y], raw) : raw
      ctx.pendingPath.current = setHandle(g.start, g.anchor, g.which, h, !e.altKey)
    } else if (g.kind === 'bend' && g.seg != null) {
      ctx.pendingPath.current = bendSegment(
        g.start,
        g.seg,
        point.x - g.down[0],
        point.y - g.down[1],
      )
    }
    ctx.schedule()
  }
}

/** Click-drag past 3 px turns the new anchor into a smooth point with live handles. */
function moveAddGesture(
  ctx: PenCtx,
  g: PenGesture,
  e: { altKey: boolean; shiftKey: boolean },
  point: DocPoint,
  zoom: number,
): void {
  if (!g.created && Math.hypot(point.x - g.down[0], point.y - g.down[1]) * zoom < 3) return
  if (!g.created) {
    // append once, then keep editing the gesture's own copy (g.start never grows)
    g.created = true
    g.work = {
      anchors: [...g.start.anchors, { x: g.down[0], y: g.down[1], hIn: null, hOut: null }],
      closed: false,
    }
  }
  const next = g.work!
  const i = next.anchors.length - 1
  const hOut = constrainPoint(
    g.down,
    point.x,
    point.y,
    useStore.getState().toolOpts.penSnap,
    e.shiftKey,
  )
  const hIn: Pt = e.altKey ? [point.x, point.y] : [2 * g.down[0] - hOut[0], 2 * g.down[1] - hOut[1]]
  ctx.pendingPath.current = {
    ...next,
    anchors: next.anchors.map((a, k) => (k === i ? { ...a, hIn: e.altKey ? null : hIn, hOut } : a)),
  }
  useStore.getState().patchPen({ selected: i })
}

/** Double-click: insert on a segment, toggle an anchor, or reenter a committed bezier object. */
function makeDoubleClick(ctx: PenCtx) {
  return (point: DocPoint, idx: number, zoom: number): void => {
    const p = ctx.paramsRef.current
    const s = useStore.getState()
    const D = s.pen
    if (D && D.path.anchors.length > 0) {
      const hit = hitPen(D.path, point.x, point.y, hitTol(false, zoom))
      if (hit?.kind === 'anchor') {
        s.patchPen({ selected: hit.i })
        ctx.apply(toggleSmooth(D.path, hit.i))
      } else if (hit?.kind === 'segment') {
        ctx.apply(insertAnchor(D.path, hit.seg, hit.t))
      }
      return
    }
    // no draft: a double-click on a committed parametric curve reopens it for editing
    const objId = idx >= 0 ? (p.doc.cellObj?.[idx] ?? 0) : 0
    const params = objId > 0 ? bezierSourceOf(p.doc, objId) : null
    if (!params) return
    const path = pathFromD(String(params['d'] ?? ''))
    if (!path) return
    const w = Number(params['w'] ?? 1)
    s.patchToolOpts({ penWidth: Number.isFinite(w) ? Math.min(16, Math.max(1, Math.round(w))) : 1 })
    s.patchShapePaint({
      stroke: params['stroke'] === true,
      fill: params['fillMode'] === 'solid' ? 'solid' : 'none',
      strokeColor: String(params['strokeColor'] ?? ''),
    })
    s.beginPen({ path, replaceObjId: objId })
    p.scheduleOverlay()
  }
}

/** Overlay input snapshot, read at draw time (all refs — no re-render needed). */
function overlayStateOf(ctx: PenCtx, zoom: number): PenOverlayInput {
  const s = useStore.getState()
  const D = s.pen
  const cursor = ctx.cursorRef.current
  let closeHint = false
  if (D && !D.path.closed && D.path.anchors.length >= 2 && cursor && !ctx.gesture.current) {
    const a0 = D.path.anchors[0]
    closeHint = Math.hypot(cursor[0] - a0.x, cursor[1] - a0.y) <= (PEN_HIT_PX * 1.5) / zoom
  }
  let rubberCursor = cursor
  if (cursor && D && !D.path.closed && D.path.anchors.length > 0 && !ctx.gesture.current) {
    const lastA = D.path.anchors[D.path.anchors.length - 1]
    rubberCursor = constrainPoint(
      [lastA.x, lastA.y],
      cursor[0],
      cursor[1],
      s.toolOpts.penSnap,
      ctx.shiftRef.current,
    )
  }
  return {
    path: D?.path ?? null,
    cursor: rubberCursor,
    rubber: !ctx.gesture.current && D != null && D.path.anchors.length > 0 && !D.path.closed,
    hover: ctx.hoverRef.current,
    selected: D?.selected ?? null,
    closeHint,
  }
}

/**
 * The pen tool's interaction brain: anchor/handle hit-testing and dragging, the click-drag smooth
 * point, closing, insertion, re-edit entry. The draft lives in the pen slice, the pixel preview in
 * the shared staging buffer; only the commit (see usePenActions) touches the doc.
 */
export function usePenTool(P: PenToolParams) {
  const paramsRef = useRef(P)
  paramsRef.current = P
  const gesture = useRef<PenGesture | null>(null)
  const cursorRef = useRef<Pt | null>(null)
  const hoverRef = useRef<PenHit | null>(null)
  const shiftRef = useRef(false)
  const pendingPath = useRef<import('../../engine/curves/index.ts').CurvePath | null>(null)
  const rafRef = useRef(0)

  /** Rebuild the staged pixel preview from the current draft (outside history). */
  const refreshPreview = useCallback(() => {
    const p = paramsRef.current
    const s = useStore.getState()
    const D = s.pen
    if (!D || D.path.anchors.length === 0) {
      if (p.stagingRef.current) {
        p.stagingRef.current = null
        p.bumpStaging()
      }
      return
    }
    const { cells, resolved } = buildPenInk(p, D.path)
    const st = p.ensureStaging() as {
      cells: Map<number, number | null>
      objs: Map<number, number | null>
      cellsBuf?: unknown
      links?: unknown
      palette?: readonly string[]
      layerId?: number
    }
    st.cells = new Map()
    st.objs = new Map()
    st.cellsBuf = undefined
    st.links = undefined
    for (const [i, v] of cells) {
      st.cells.set(i, v)
      st.objs.set(i, PENDING_OBJ)
    }
    st.palette = resolved.palette
    p.scheduleStaging()
  }, [])

  /** RAF-coalesced flush: one store patch + one staging refresh + one overlay draw per frame. */
  const schedule = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const s = useStore.getState()
      if (pendingPath.current) {
        const path = pendingPath.current
        pendingPath.current = null
        if (s.pen) s.patchPen({ path })
      }
      refreshPreview()
      paramsRef.current.scheduleOverlay()
    })
  }, [])
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  // the draft can also change outside the canvas gestures (panel action buttons edit the path
  // directly): restage the pixel preview whenever the store's path identity moves
  useEffect(() => {
    let last = useStore.getState().pen?.path ?? null
    return useStore.subscribe((s) => {
      const path = s.pen?.path ?? null
      if (path === last) return
      last = path
      schedule()
    })
  }, [schedule])

  /** Synchronous draft application for terminal gestures — commits must not wait for a frame. */
  const apply = useCallback(
    (path: CurvePath) => {
      const s = useStore.getState()
      if (s.pen) s.patchPen({ path })
      refreshPreview()
      paramsRef.current.scheduleOverlay()
    },
    [refreshPreview],
  )

  const ctx: PenCtx = {
    paramsRef,
    gesture,
    cursorRef,
    hoverRef,
    shiftRef,
    pendingPath,
    schedule,
    apply,
  }
  // plain per-render closures: the stage reads them through penRef, so identity is irrelevant
  const pointerUp = () => {
    const g = gesture.current
    gesture.current = null
    if (!g) return
    // the mailbox is consumed here for terminal gestures — a pending rAF must never
    // re-apply an older path over newer state
    pendingPath.current = null
    if (g.kind === 'add') {
      if (g.created) {
        // drag-created smooth point: land its final handle state synchronously
        if (g.work) apply(g.work)
        return
      }
      // a plain click places a corner anchor at the snapped press point (dragging creates
      // the smooth variant live in moveAddGesture)
      apply({
        anchors: [...g.start.anchors, makeAnchor(g.down[0], g.down[1])],
        closed: false,
      })
      useStore.getState().patchPen({ selected: g.start.anchors.length })
      return
    }
    // anchor/handle/bend drags: land the latest move synchronously (frames may lag)
    if (pendingPath.current) {
      apply(pendingPath.current)
    }
    paramsRef.current.scheduleOverlay()
  }
  const pointerDown = makePointerDown(ctx)
  const pointerMove = makePointerMove(ctx)
  const doubleClick = makeDoubleClick(ctx)
  const overlayState = (zoom: number) => overlayStateOf(ctx, zoom)

  const actions = usePenActions({
    inkParams: useCallback(() => paramsRef.current, []),
    getGesture: useCallback(() => gesture.current, []),
    setGesture: useCallback((g: PenGesture | null) => {
      gesture.current = g
    }, []),
    clearStaging: useCallback(() => {
      const p = paramsRef.current
      if (p.stagingRef.current) {
        p.stagingRef.current = null
        p.bumpStaging()
      }
    }, []),
    scheduleOverlay: useCallback(() => paramsRef.current.scheduleOverlay(), []),
    schedule,
    refreshPreview,
  })

  return {
    pointerDown,
    pointerMove,
    pointerUp,
    doubleClick,
    overlayState,
    ...actions,
  }
}
