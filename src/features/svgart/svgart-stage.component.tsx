import { useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react'

import {
  fillHandles,
  sceneToSvg,
  shapeBBox,
  shapeCenter,
  shapePath,
  type Handle,
  type Pt,
  type Shape,
  type SvgLayer,
} from '../../engine/svgart/index.ts'
import { useStore } from '../../state/editor.store.ts'
import { useStageDrag } from './use-stage-drag.hook.ts'

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
 * with canvas handles — shape move/rotate/scale, linear axis ends, radial center/rim/focus. Gesture
 * logic lives in `useStageDrag`; this component owns sizing/rendering.
 */
export function SvgArtStage(): ReactElement {
  const scene = useStore((s) => s.svgartScene)
  const selection = useStore((s) => s.svgartSelection)
  const updateScene = useStore((s) => s.updateSvgArtScene)
  const select = useStore((s) => s.selectSvgArtLayer)
  const hostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
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
  const selected: SvgLayer | null = scene.layers.find((l) => l.id === selection.layerId) ?? null
  const selectedFill = selected?.fills[selection.fillIndex]
  const handles = useMemo(
    () => (selected && selectedFill ? fillHandles(selected.shape, selectedFill) : []),
    [selected, selectedFill],
  )
  const arm = selected ? rotateArm(selected.shape, scene) : null
  const scaleAt = selected ? scaleKnob(selected.shape) : null

  const toScene = (e: React.PointerEvent): Pt => {
    const box = stageRef.current?.getBoundingClientRect()
    if (!box || box.width === 0) return { x: 0, y: 0 }
    return {
      x: ((e.clientX - box.left) / box.width) * scene.width,
      y: ((e.clientY - box.top) / box.height) * scene.height,
    }
  }
  const gestures = useStageDrag({
    scene,
    selected,
    fitScale: fit.scale,
    fillIndex: selection.fillIndex,
    handles,
    arm,
    scaleAt,
    toScene,
    updateScene,
    select,
  })

  return (
    <div ref={hostRef} className="bg-app relative min-h-0 flex-1 overflow-hidden">
      {fit.width > 0 && (
        <div
          ref={stageRef}
          className="absolute touch-none shadow-[0_0_0_1px_var(--line)]"
          style={{ left: fit.left, top: fit.top, width: fit.width, height: fit.height }}
          {...gestures}
        >
          <div
            className="[&>svg]:block [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <StageOverlay
            scene={scene}
            fit={fit}
            selected={selected}
            arm={arm}
            handles={handles}
            scaleAt={scaleAt}
          />
        </div>
      )}
    </div>
  )
}

/** Selection outline, rotation arm, scale knob and gradient handle knobs (overlay, no events). */
function StageOverlay({
  scene,
  fit,
  selected,
  arm,
  handles,
  scaleAt,
}: {
  scene: { width: number; height: number }
  fit: Fit
  selected: { shape: Shape } | null
  arm: Pt | null
  handles: Handle[]
  scaleAt: Pt | null
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
      {selected && scaleAt && (
        <span
          className="border-accent-line bg-panel absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2"
          style={pct(scaleAt)}
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

/** Scale knob: the bottom-right corner of the shape's enclosing box. */
function scaleKnob(shape: Shape): Pt {
  const bb = shapeBBox(shape)
  return { x: bb.x + bb.w, y: bb.y + bb.h }
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
