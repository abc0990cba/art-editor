import { useRef, useState, type RefObject } from 'react'

import {
  dragHandle,
  dragStopHandle,
  nearestHandle,
  rotateLayer,
  scaleLayer,
  shapeBBox,
  shapeCenter,
  topLayerAt,
  translateLayer,
  type BBox,
  type Handle,
  type Paint,
  type Pt,
  type SvgLayer,
  type SvgScene,
  type StopTick,
} from '../../engine/svgart/index.ts'
import type { SvgArtSelection } from '../../state/svgart.slice.ts'

/** One active pointer gesture in scene coordinates. */
interface Drag {
  kind: 'move' | 'rotate' | 'handle' | 'scale' | 'marquee' | 'stop'
  layerId: string
  fillIndex: number
  handle?: Handle['id']
  stopIndex?: number
  last: Pt
  lastAngle: number
  /** Group moves and scales work on untouched snapshots, so every frame is absolute. */
  origins?: SvgLayer[]
  center?: Pt
  startDist?: number
  /** Snap candidate lines collected at drag start (scene coords). */
  snapX?: number[]
  snapY?: number[]
}

export interface Guides {
  xs: number[]
  ys: number[]
}

export interface StageDragSetup {
  scene: SvgScene
  selection: SvgArtSelection
  primary: SvgLayer | null
  primaryFillIndex: number
  primaryFill: Paint | null
  fitScale: number
  handles: Handle[]
  arm: Pt | null
  scaleAt: Pt | null
  stopTicksArr: StopTick[]
  toScene: (e: React.PointerEvent) => Pt
  updateScene: (update: (scene: SvgScene) => SvgScene) => void
  select: (layerId: string | null, fillIndex?: number) => void
  toggle: (layerId: string) => void
}

/** Everything the module-level gesture handlers need for one render pass. */
interface DragCtx {
  drag: RefObject<Drag | null>
  setGuides: (g: Guides | null) => void
  setMarquee: (m: { a: Pt; b: Pt } | null) => void
  getMarquee: () => { a: Pt; b: Pt } | null
  scene: SvgScene
  selectedIds: string[]
  primary: SvgLayer | null
  primaryFill: Paint | null
  primaryFillIndex: number
  fitScale: number
  handles: Handle[]
  arm: Pt | null
  scaleAt: Pt | null
  stopTicksArr: StopTick[]
  toScene: (e: React.PointerEvent) => Pt
  updateScene: StageDragSetup['updateScene']
  select: StageDragSetup['select']
  toggle: StageDragSetup['toggle']
}

/**
 * Pointer gesture logic of the studio stage: hit-test stop ticks → gradient handles → scale knob →
 * rotate arm → layers. Supports multi-selection (drag moves every selected layer from untouched
 * snapshots, Shift-click toggles), rubber-band marquee on empty space, and smart snapping to the
 * canvas center and other layers' bbox edges/centers with guide lines. Everything here is
 * scene-space; screen→scene conversion stays in the component.
 */
export function useStageDrag(setup: StageDragSetup): {
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: () => void
  onPointerCancel: () => void
  guides: Guides | null
  marquee: { a: Pt; b: Pt } | null
} {
  const drag = useRef<Drag | null>(null)
  const marqueeRef = useRef<{ a: Pt; b: Pt } | null>(null)
  const [guides, setGuides] = useState<Guides | null>(null)
  const [marquee, setMarquee] = useState<{ a: Pt; b: Pt } | null>(null)
  const selectedIds =
    setup.selection.layerId === null ? [] : [setup.selection.layerId, ...setup.selection.extraIds]
  const ctx: DragCtx = {
    ...setup,
    drag,
    setGuides,
    setMarquee: (m) => {
      marqueeRef.current = m
      setMarquee(m)
    },
    getMarquee: () => marqueeRef.current,
    selectedIds,
  }
  return {
    onPointerDown: (e) => pointerDown(ctx, e),
    onPointerMove: (e) => pointerMove(ctx, e),
    onPointerUp: () => pointerFinish(ctx),
    onPointerCancel: () => pointerFinish(ctx),
    guides,
    marquee,
  }
}

/** Hit-test priority: stop tick → gradient handle → scale knob → rotate arm → layer/marquee. */
function pointerDown(ctx: DragCtx, e: React.PointerEvent): void {
  if (ctx.drag.current !== null) return
  e.currentTarget.setPointerCapture(e.pointerId)
  const p = ctx.toScene(e)
  const drag = startHandleDrag(ctx, p, 14 / (ctx.fitScale || 1))
  if (drag !== null) {
    ctx.drag.current = drag
    return
  }
  const layerDrag = startLayerDrag(ctx, p, e)
  if (layerDrag !== null) {
    ctx.drag.current = layerDrag
    return
  }
  ctx.drag.current = { kind: 'marquee', layerId: '', fillIndex: 0, last: p, lastAngle: 0 }
  ctx.setMarquee({ a: p, b: p })
}

function startHandleDrag(ctx: DragCtx, p: Pt, tol: number): Drag | null {
  const { primary } = ctx
  if (primary === null) return null
  const stop = nearestTick(ctx.stopTicksArr, p, tol)
  if (ctx.primaryFill !== null && stop !== null) {
    return {
      kind: 'stop',
      layerId: primary.id,
      fillIndex: ctx.primaryFillIndex,
      stopIndex: stop.index,
      last: p,
      lastAngle: 0,
    }
  }
  const handle = nearestHandle(ctx.handles, p, tol)
  if (handle !== null) {
    return {
      kind: 'handle',
      layerId: primary.id,
      fillIndex: ctx.primaryFillIndex,
      handle: handle.id,
      last: p,
      lastAngle: 0,
    }
  }
  if (ctx.scaleAt !== null && Math.hypot(ctx.scaleAt.x - p.x, ctx.scaleAt.y - p.y) <= tol) {
    const center = shapeCenter(primary.shape)
    return {
      kind: 'scale',
      layerId: primary.id,
      fillIndex: ctx.primaryFillIndex,
      last: p,
      lastAngle: 0,
      origins: [primary],
      center,
      startDist: Math.max(1, Math.hypot(p.x - center.x, p.y - center.y)),
    }
  }
  if (ctx.arm !== null && Math.hypot(ctx.arm.x - p.x, ctx.arm.y - p.y) <= tol) {
    const c = shapeCenter(primary.shape)
    return {
      kind: 'rotate',
      layerId: primary.id,
      fillIndex: ctx.primaryFillIndex,
      last: p,
      lastAngle: Math.atan2(p.y - c.y, p.x - c.x),
    }
  }
  return null
}

/** A hit layer joins an existing group drag; Shift-click toggles it; empty space marquees. */
function startLayerDrag(ctx: DragCtx, p: Pt, e: React.PointerEvent): Drag | null {
  const hit = topLayerAt(ctx.scene, p)
  if (hit === null) return null
  if (e.shiftKey) {
    ctx.toggle(hit.id)
    return null
  }
  const moving = ctx.selectedIds.includes(hit.id)
    ? ctx.scene.layers.filter((l) => ctx.selectedIds.includes(l.id))
    : [hit]
  if (!moving.some((l) => l.id === hit.id)) ctx.select(hit.id)
  return {
    kind: 'move',
    layerId: hit.id,
    fillIndex: ctx.primaryFillIndex,
    last: p,
    lastAngle: 0,
    origins: moving,
    ...snapTargets(ctx.scene, moving),
  }
}

function pointerMove(ctx: DragCtx, e: React.PointerEvent): void {
  const d = ctx.drag.current
  if (d === null) return
  const p = ctx.toScene(e)
  if (d.kind === 'marquee') {
    d.last = p
    ctx.setMarquee({ a: d.last, b: p })
    return
  }
  if (d.kind === 'move' && d.origins !== undefined) {
    const snapped = applySnap(d, p.x - d.last.x, p.y - d.last.y, ctx.fitScale)
    ctx.setGuides(snapped.guides)
    const origins = d.origins
    ctx.updateScene((s) => ({
      ...s,
      layers: s.layers.map((l) => {
        const origin = origins.find((o) => o.id === l.id)
        return origin === undefined ? l : translateLayer(origin, snapped.dx, snapped.dy)
      }),
    }))
    return
  }
  if (d.kind === 'stop' && d.stopIndex !== undefined) {
    const index = d.stopIndex
    const fillIndex = d.fillIndex
    const shape = ctx.primary?.shape
    if (shape === undefined || shape === null) return
    ctx.updateScene((s) => ({
      ...s,
      layers: s.layers.map((l) =>
        l.id === d.layerId
          ? {
              ...l,
              fills: l.fills.map((f, fi) =>
                fi === fillIndex ? dragStopHandle(shape, f, index, p) : f,
              ),
            }
          : l,
      ),
    }))
    return
  }
  if (d.kind === 'rotate') {
    const layer = ctx.scene.layers.find((l) => l.id === d.layerId)
    if (!layer) return
    const c = shapeCenter(layer.shape)
    const angle = Math.atan2(p.y - c.y, p.x - c.x)
    let delta = ((angle - d.lastAngle) * 180) / Math.PI
    if (delta > 180) delta -= 360
    if (delta < -180) delta += 360
    d.lastAngle = angle
    ctx.updateScene((s) => ({
      ...s,
      layers: s.layers.map((l) => (l.id === d.layerId ? rotateLayer(l, delta) : l)),
    }))
    return
  }
  if (
    d.kind === 'scale' &&
    d.origins !== undefined &&
    d.center !== undefined &&
    d.startDist !== undefined
  ) {
    const origin = d.origins[0]
    const center = d.center
    if (origin === undefined) return
    const factor = Math.max(0.02, Math.hypot(p.x - center.x, p.y - center.y) / d.startDist)
    ctx.updateScene((s) => ({
      ...s,
      layers: s.layers.map((l) => (l.id === d.layerId ? scaleLayer(origin, factor, center) : l)),
    }))
    return
  }
  if (d.handle !== undefined) {
    const handle = d.handle
    ctx.updateScene((s) => ({
      ...s,
      layers: s.layers.map((l) => (l.id === d.layerId ? dragHandle(l, d.fillIndex, handle, p) : l)),
    }))
  }
}

function pointerFinish(ctx: DragCtx): void {
  const d = ctx.drag.current
  if (d?.kind === 'marquee') {
    const rect = normRect(d.last, ctx.getMarquee()?.b ?? d.last)
    if (Math.hypot(rect.w, rect.h) * (ctx.fitScale || 1) < 6) {
      ctx.select(null)
    } else {
      const hits = ctx.scene.layers.filter(
        (l) => l.visible && rectHitsBBox(rect, shapeBBox(l.shape)),
      )
      ctx.select(hits.at(-1)?.id ?? null, 0)
      for (const h of hits.slice(0, -1)) ctx.toggle(h.id)
    }
  }
  ctx.drag.current = null
  ctx.setGuides(null)
  ctx.setMarquee(null)
}

/** Snap candidate lines: canvas center + every other visible layer's bbox edges and center. */
function snapTargets(scene: SvgScene, moving: SvgLayer[]): { snapX: number[]; snapY: number[] } {
  const movingIds = new Set(moving.map((l) => l.id))
  const snapX = [scene.width / 2]
  const snapY = [scene.height / 2]
  for (const l of scene.layers) {
    if (!l.visible || movingIds.has(l.id)) continue
    const bb = shapeBBox(l.shape)
    snapX.push(bb.x, bb.x + bb.w / 2, bb.x + bb.w)
    snapY.push(bb.y, bb.y + bb.h / 2, bb.y + bb.h)
  }
  return { snapX, snapY }
}

/** Snap the group translation onto the nearest candidate line pair within tolerance. */
function applySnap(
  d: Drag,
  dx: number,
  dy: number,
  fitScale: number,
): { dx: number; dy: number; guides: { xs: number[]; ys: number[] } | null } {
  if (d.origins === undefined) return { dx, dy, guides: null }
  const tol = 8 / (fitScale || 1)
  const bb = unionBBox(d.origins.map((o) => shapeBBox(o.shape)))
  const movingXs = [bb.x, bb.x + bb.w / 2, bb.x + bb.w].map((v) => v + dx)
  const movingYs = [bb.y, bb.y + bb.h / 2, bb.y + bb.h].map((v) => v + dy)
  const guides = { xs: [] as number[], ys: [] as number[] }
  let bestX: { delta: number; line: number } | null = null
  for (const mx of movingXs) {
    for (const t of d.snapX ?? []) {
      const delta = t - mx
      if (Math.abs(delta) <= tol && (bestX === null || Math.abs(delta) < Math.abs(bestX.delta))) {
        bestX = { delta, line: t }
      }
    }
  }
  let bestY: { delta: number; line: number } | null = null
  for (const my of movingYs) {
    for (const t of d.snapY ?? []) {
      const delta = t - my
      if (Math.abs(delta) <= tol && (bestY === null || Math.abs(delta) < Math.abs(bestY.delta))) {
        bestY = { delta, line: t }
      }
    }
  }
  if (bestX !== null) {
    dx += bestX.delta
    guides.xs.push(bestX.line)
  }
  if (bestY !== null) {
    dy += bestY.delta
    guides.ys.push(bestY.line)
  }
  return { dx, dy, guides: guides.xs.length > 0 || guides.ys.length > 0 ? guides : null }
}

function unionBBox(boxes: BBox[]): BBox {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const b of boxes) {
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.w)
    maxY = Math.max(maxY, b.y + b.h)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

function normRect(a: Pt, b: Pt): BBox {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  }
}

function rectHitsBBox(rect: BBox, bb: BBox): boolean {
  return (
    rect.x <= bb.x + bb.w &&
    rect.x + rect.w >= bb.x &&
    rect.y <= bb.y + bb.h &&
    rect.y + rect.h >= bb.y
  )
}

function nearestTick(ticks: StopTick[], p: Pt, tol: number): StopTick | null {
  let best: StopTick | null = null
  let bestDist = tol
  for (const t of ticks) {
    const dist = Math.hypot(t.at.x - p.x, t.at.y - p.y)
    if (dist <= bestDist) {
      best = t
      bestDist = dist
    }
  }
  return best
}
