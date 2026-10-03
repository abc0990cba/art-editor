import { useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react'

import {
  dragHandle,
  fillHandles,
  nearestHandle,
  rotateLayer,
  sceneToSvg,
  shapeBBox,
  shapeCenter,
  shapePath,
  topLayerAt,
  translateLayer,
  type Handle,
  type HandleId,
  type Pt,
  type Shape,
} from '../../engine/svgart/index.ts'
import { useStore } from '../../state/editor.store.ts'

/** One active pointer gesture in scene coordinates. */
interface Drag {
  kind: 'move' | 'rotate' | 'handle'
  layerId: string
  fillIndex: number
  handle?: HandleId
  last: Pt
  lastAngle: number
}

/** Fitted stage rectangle (scene scaled into the host box, centered). */
interface Fit {
  left: number
  top: number
  width: number
  height: number
  scale: number
}

/**
 * The studio stage: the exact serialized SVG (what leaves to Illustrator), plus a selection overlay
 * with canvas handles — shape move/rotate, linear axis ends, radial center/rim/focus.
 */
export function SvgArtStage(): ReactElement {
  const scene = useStore((s) => s.svgartScene)
  const selection = useStore((s) => s.svgartSelection)
  const updateScene = useStore((s) => s.updateSvgArtScene)
  const select = useStore((s) => s.selectSvgArtLayer)
  const hostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [host, setHost] = useState<{ w: number; h: number }>({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const el = hostRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setHost({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setHost({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const svg = useMemo(() => sceneToSvg(scene), [scene])
  const fit = fitInto(host.w, host.h, scene.width, scene.height)
  const selected = scene.layers.find((l) => l.id === selection.layerId) ?? null
  const selectedFill = selected?.fills[selection.fillIndex]
  const handles = useMemo(
    () => (selected && selectedFill ? fillHandles(selected.shape, selectedFill) : []),
    [selected, selectedFill],
  )
  const arm = selected ? rotateArm(selected.shape, scene) : null

  const toScene = (e: React.PointerEvent): Pt => {
    const box = stageRef.current?.getBoundingClientRect()
    if (!box || box.width === 0) return { x: 0, y: 0 }
    return {
      x: ((e.clientX - box.left) / box.width) * scene.width,
      y: ((e.clientY - box.top) / box.height) * scene.height,
    }
  }

  const onPointerDown = (e: React.PointerEvent): void => {
    if (drag.current !== null) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = toScene(e)
    const tol = 14 / (fit.scale || 1)
    const handle = selected ? nearestHandle(handles, p, tol) : null
    if (handle && selected) {
      drag.current = {
        kind: 'handle',
        layerId: selected.id,
        fillIndex: selection.fillIndex,
        handle: handle.id,
        last: p,
        lastAngle: 0,
      }
      return
    }
    if (selected && arm && Math.hypot(arm.x - p.x, arm.y - p.y) <= tol) {
      const c = shapeCenter(selected.shape)
      drag.current = {
        kind: 'rotate',
        layerId: selected.id,
        fillIndex: selection.fillIndex,
        last: p,
        lastAngle: Math.atan2(p.y - c.y, p.x - c.x),
      }
      return
    }
    const hit = topLayerAt(scene, p)
    if (hit) {
      select(hit.id)
      drag.current = {
        kind: 'move',
        layerId: hit.id,
        fillIndex: selection.fillIndex,
        last: p,
        lastAngle: 0,
      }
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

  return (
    <div ref={hostRef} className="bg-app relative min-h-0 flex-1 overflow-hidden">
      {fit.width > 0 && (
        <div
          ref={stageRef}
          className="absolute touch-none shadow-[0_0_0_1px_var(--line)]"
          style={{ left: fit.left, top: fit.top, width: fit.width, height: fit.height }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div
            className="[&>svg]:block [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <StageOverlay scene={scene} fit={fit} selected={selected} arm={arm} handles={handles} />
        </div>
      )}
    </div>
  )
}

/** Selection outline, rotation arm and the gradient handle knobs (pure overlay, no events). */
function StageOverlay({
  scene,
  fit,
  selected,
  arm,
  handles,
}: {
  scene: { width: number; height: number }
  fit: Fit
  selected: { shape: Shape } | null
  arm: Pt | null
  handles: Handle[]
}): ReactElement {
  const pct = (p: Pt): { left: string; top: string } => ({
    left: `${(p.x / scene.width) * 100}%`,
    top: `${(p.y / scene.height) * 100}%`,
  })
  return (
    <>
      <svg
        viewBox={`0 0 ${scene.width} ${scene.height}`}
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        fill="none"
      >
        {selected && (
          <path
            d={shapePath(selected.shape)}
            stroke="var(--accent)"
            strokeWidth={1.5 / fit.scale}
            strokeDasharray={`${6 / fit.scale} ${4 / fit.scale}`}
          />
        )}
        {selected && arm && (
          <line
            x1={shapeCenter(selected.shape).x}
            y1={shapeCenter(selected.shape).y}
            x2={arm.x}
            y2={arm.y}
            stroke="var(--accent)"
            strokeWidth={1.5 / fit.scale}
          />
        )}
      </svg>
      {selected && arm && (
        <span
          className="bg-panel border-accent-line absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
          style={pct(arm)}
        />
      )}
      {handles.map((h) => (
        <HandleKnob key={h.id} at={h.at} pct={pct} dark={h.id === 'radial-focus'} />
      ))}
    </>
  )
}

function HandleKnob({
  at,
  pct,
  dark,
}: {
  at: Pt
  pct: (p: Pt) => { left: string; top: string }
  dark: boolean
}): ReactElement {
  return (
    <span
      className={`absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-sm ${
        dark ? 'border-accent-text bg-accent-soft' : 'border-accent-line bg-panel'
      }`}
      style={pct(at)}
    />
  )
}

/** Rotation arm tip: above the shape's enclosing box. */
function rotateArm(shape: Shape, scene: { width: number; height: number }): Pt {
  const bb = shapeBBox(shape)
  const c = shapeCenter(shape)
  const extent = Math.max(bb.w, bb.h) / 2
  return { x: c.x, y: Math.max(0, c.y - extent - scene.height * 0.04) }
}

function fitInto(hostW: number, hostH: number, sceneW: number, sceneH: number): Fit {
  if (hostW <= 0 || hostH <= 0 || sceneW <= 0 || sceneH <= 0) {
    return { left: 0, top: 0, width: 0, height: 0, scale: 0 }
  }
  const scale = Math.min(hostW / sceneW, hostH / sceneH)
  const width = sceneW * scale
  const height = sceneH * scale
  return { left: (hostW - width) / 2, top: (hostH - height) / 2, width, height, scale }
}
