import { useRef } from 'react'

import {
  dragHandle,
  nearestHandle,
  rotateLayer,
  scaleLayer,
  shapeCenter,
  topLayerAt,
  translateLayer,
  type Handle,
  type HandleId,
  type Pt,
  type SvgLayer,
  type SvgScene,
} from '../../engine/svgart/index.ts'

/** One active pointer gesture in scene coordinates. */
interface Drag {
  kind: 'move' | 'rotate' | 'handle' | 'scale'
  layerId: string
  fillIndex: number
  handle?: HandleId
  last: Pt
  lastAngle: number
  /** Scale gestures scale the untouched snapshot, so every frame is absolute. */
  origin?: SvgLayer
  center?: Pt
  startDist?: number
}

export interface StageDragSetup {
  scene: SvgScene
  selected: SvgLayer | null
  fitScale: number
  fillIndex: number
  handles: Handle[]
  arm: Pt | null
  scaleAt: Pt | null
  toScene: (e: React.PointerEvent) => Pt
  updateScene: (update: (scene: SvgScene) => SvgScene) => void
  select: (layerId: string | null, fillIndex?: number) => void
}

/**
 * Pointer gesture logic of the studio stage: hit-test handles → scale knob → rotate arm → topmost
 * layer, then stream pure engine ops (translate/rotate/scale/dragHandle) into the store. Screen →
 * scene conversion stays in the component; everything here is scene-space.
 */
export function useStageDrag(setup: StageDragSetup): {
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: () => void
  onPointerCancel: () => void
} {
  const drag = useRef<Drag | null>(null)
  const {
    scene,
    selected,
    fitScale,
    fillIndex,
    handles,
    arm,
    scaleAt,
    toScene,
    updateScene,
    select,
  } = setup

  const onPointerDown = (e: React.PointerEvent): void => {
    if (drag.current !== null) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = toScene(e)
    const tol = 14 / (fitScale || 1)
    const handle = selected ? nearestHandle(handles, p, tol) : null
    if (handle && selected) {
      drag.current = {
        kind: 'handle',
        layerId: selected.id,
        fillIndex,
        handle: handle.id,
        last: p,
        lastAngle: 0,
      }
      return
    }
    if (selected && scaleAt && Math.hypot(scaleAt.x - p.x, scaleAt.y - p.y) <= tol) {
      const center = shapeCenter(selected.shape)
      drag.current = {
        kind: 'scale',
        layerId: selected.id,
        fillIndex,
        last: p,
        lastAngle: 0,
        origin: selected,
        center,
        startDist: Math.max(1, Math.hypot(p.x - center.x, p.y - center.y)),
      }
      return
    }
    if (selected && arm && Math.hypot(arm.x - p.x, arm.y - p.y) <= tol) {
      const c = shapeCenter(selected.shape)
      drag.current = {
        kind: 'rotate',
        layerId: selected.id,
        fillIndex,
        last: p,
        lastAngle: Math.atan2(p.y - c.y, p.x - c.x),
      }
      return
    }
    const hit = topLayerAt(scene, p)
    if (hit) {
      select(hit.id)
      drag.current = { kind: 'move', layerId: hit.id, fillIndex, last: p, lastAngle: 0 }
    } else {
      select(null)
    }
  }

  const onPointerMove = (e: React.PointerEvent): void => {
    const d = drag.current
    if (d === null) return
    const p = toScene(e)
    if (d.kind === 'move') {
      const dx = p.x - d.last.x
      const dy = p.y - d.last.y
      d.last = p
      updateScene((s) => ({
        ...s,
        layers: s.layers.map((l) => (l.id === d.layerId ? translateLayer(l, dx, dy) : l)),
      }))
      return
    }
    if (d.kind === 'rotate') {
      const layer = scene.layers.find((l) => l.id === d.layerId)
      if (!layer) return
      const c = shapeCenter(layer.shape)
      const angle = Math.atan2(p.y - c.y, p.x - c.x)
      let delta = ((angle - d.lastAngle) * 180) / Math.PI
      if (delta > 180) delta -= 360
      if (delta < -180) delta += 360
      d.lastAngle = angle
      updateScene((s) => ({
        ...s,
        layers: s.layers.map((l) => (l.id === d.layerId ? rotateLayer(l, delta) : l)),
      }))
      return
    }
    if (
      d.kind === 'scale' &&
      d.origin !== undefined &&
      d.center !== undefined &&
      d.startDist !== undefined
    ) {
      const origin = d.origin
      const center = d.center
      const factor = Math.max(0.02, Math.hypot(p.x - center.x, p.y - center.y) / d.startDist)
      updateScene((s) => ({
        ...s,
        layers: s.layers.map((l) => (l.id === d.layerId ? scaleLayer(origin, factor, center) : l)),
      }))
      return
    }
    if (d.handle !== undefined) {
      const handle = d.handle
      updateScene((s) => ({
        ...s,
        layers: s.layers.map((l) =>
          l.id === d.layerId ? dragHandle(l, d.fillIndex, handle, p) : l,
        ),
      }))
    }
  }

  const endDrag = (): void => {
    drag.current = null
  }

  return { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag }
}
