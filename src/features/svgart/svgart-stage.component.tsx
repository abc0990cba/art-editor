import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react'

import {
  fillHandles,
  sceneToSvg,
  shapeBBox,
  shapeCenter,
  shapePath,
  stopTicks,
  type Handle,
  type Pt,
  type Shape,
  type SvgLayer,
} from '../../engine/svgart/index.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import type { CanvasView } from '../../shared/lib/canvas-view-math.util.ts'
import { FitCanvasButton } from '../../shared/ui/fit-button.component.tsx'
import { usePinchZoom } from '../../shared/ui/use-pinch-zoom.hook.ts'
import { useWheelZoom } from '../../shared/ui/use-wheel-zoom.hook.ts'
import { ZoomControls } from '../../shared/ui/zoom-controls.component.tsx'
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

const MIN_ZOOM = 0.5
const MAX_ZOOM = 8

/**
 * The studio stage: the serialized SVG in the active export profile (exactly what leaves the app),
 * plus a selection overlay — canvas handles, stop ticks, snap guides, marquee rect. Gesture logic
 * lives in `useStageDrag`; this component owns sizing, rendering and the camera: wheel zoom (shared
 * non-passive hook), two-finger pinch+pan, and the zoom plates. The view is the doc-origin offset
 * in host px — the same convention as the pixel canvas, so the shared zoom math anchors correctly.
 */
export function SvgArtStage(): ReactElement {
  const scene = useStore((s) => s.svgartScene)
  const selection = useStore((s) => s.svgartSelection)
  const profile = useStore((s) => s.svgartProfile)
  const updateScene = useStore((s) => s.updateSvgArtScene)
  const select = useStore((s) => s.selectSvgArtLayer)
  const toggle = useStore((s) => s.toggleSvgArtLayer)
  const { t } = useI18n()
  const hostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [host, setHost] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [view, setView] = useState<CanvasView>({ zoom: 1, x: 0, y: 0 })
  // live mirrors: the wheel/pinch listeners mount once and read the view at gesture time
  const viewRef = useRef(view)
  viewRef.current = view

  useLayoutEffect(() => {
    const el = hostRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setHost({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setHost({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const svg = useMemo(() => sceneToSvg(scene, { profile }), [scene, profile])
  const fit = fitInto(host.w, host.h, scene.width, scene.height)

  // the base box refits on host resize / scene change — the camera resets with it
  useLayoutEffect(() => {
    setView({ zoom: 1, x: fit.left, y: fit.top })
  }, [fit.left, fit.top])

  useWheelZoom({
    target: hostRef,
    getView: () => viewRef.current,
    applyView: setView,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
  })

  const primary: SvgLayer | null = scene.layers.find((l) => l.id === selection.layerId) ?? null
  const multi = selection.extraIds.length > 0
  const primaryFill = primary?.fills[selection.fillIndex] ?? null
  const handles = useMemo(
    () => (primary !== null && primaryFill !== null ? fillHandles(primary.shape, primaryFill) : []),
    [primary, primaryFill],
  )
  const ticks = useMemo(
    () => (primary !== null && primaryFill !== null ? stopTicks(primary.shape, primaryFill) : []),
    [primary, primaryFill],
  )
  // Rotate/scale arms make sense for a single selection only.
  const arm = primary !== null && !multi ? rotateArm(primary.shape, scene) : null
  const scaleAt = primary !== null && !multi ? scaleKnob(primary.shape) : null

  const toScene = (e: ReactPointerEvent): Pt => {
    const box = stageRef.current?.getBoundingClientRect()
    if (!box || box.width === 0) return { x: 0, y: 0 }
    return {
      x: ((e.clientX - box.left) / box.width) * scene.width,
      y: ((e.clientY - box.top) / box.height) * scene.height,
    }
  }
  const gestures = useStageDrag({
    scene,
    selection,
    primary,
    primaryFillIndex: selection.fillIndex,
    primaryFill,
    // screen px per scene unit under the current camera — keeps tolerances screen-constant
    fitScale: fit.scale * view.zoom,
    handles,
    arm,
    scaleAt,
    stopTicksArr: ticks,
    toScene,
    updateScene,
    select,
    toggle,
  })

  // ---- two-finger pinch zoom+pan on the host: the shared capture-phase hook wins over the
  // stage's own handlers, cancels an in-progress shape drag, and keeps plates out of the gesture
  const pinchActive = useRef(false)
  const stageDown = (e: ReactPointerEvent) => {
    if (pinchActive.current) return
    gestures.onPointerDown(e)
  }
  usePinchZoom({
    target: hostRef,
    getView: () => viewRef.current,
    applyView: setView,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    onGestureStart: () => {
      gestures.cancelDrag()
      pinchActive.current = true
    },
    onGestureEnd: () => {
      pinchActive.current = false
    },
    ignoreButtons: true,
  })

  const fitView = () => setView({ zoom: 1, x: fit.left, y: fit.top })

  return (
    <div ref={hostRef} className="bg-app relative min-h-0 flex-1 touch-none overflow-hidden">
      {fit.width > 0 && (
        <div
          ref={stageRef}
          className="absolute touch-none shadow-[0_0_0_1px_var(--line)]"
          style={{
            left: 0,
            top: 0,
            width: fit.width,
            height: fit.height,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
            transformOrigin: '0 0',
          }}
          onPointerDown={stageDown}
          onPointerMove={gestures.onPointerMove}
          onPointerUp={gestures.onPointerUp}
          onPointerCancel={gestures.onPointerCancel}
        >
          <div
            className="[&>svg]:block [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <StageOverlay
            scene={scene}
            fit={fit}
            zoom={view.zoom}
            selectedShapes={selectedShapes(scene, selection)}
            primaryShape={primary?.shape ?? null}
            arm={arm}
            handles={handles}
            scaleAt={scaleAt}
            ticks={ticks}
            guides={gestures.guides}
            marquee={gestures.marquee}
          />
        </div>
      )}
      <FitCanvasButton label={t('view.fit')} onFit={fitView} />
      <ZoomControls
        zoom={view.zoom}
        setView={setView}
        wrap={hostRef.current}
        min={MIN_ZOOM}
        max={MAX_ZOOM}
      />
    </div>
  )
}

function selectedShapes(
  scene: { layers: SvgLayer[] },
  selection: { layerId: string | null; extraIds: string[] },
): Shape[] {
  const ids = new Set(selection.layerId === null ? [] : [selection.layerId, ...selection.extraIds])
  return scene.layers.filter((l) => ids.has(l.id)).map((l) => l.shape)
}

/** Selection outlines, handles, stop ticks, snap guides and the marquee rect (no events). */
function StageOverlay({
  scene,
  fit,
  zoom,
  selectedShapes: shapes,
  primaryShape,
  arm,
  handles,
  scaleAt,
  ticks,
  guides,
  marquee,
}: {
  scene: { width: number; height: number }
  fit: Fit
  /** View zoom — strokes stay screen-constant, DOM knobs counter-scale by 1/zoom */
  zoom: number
  selectedShapes: Shape[]
  primaryShape: Shape | null
  arm: Pt | null
  handles: Handle[]
  scaleAt: Pt | null
  ticks: { at: Pt }[]
  guides: { xs: number[]; ys: number[] } | null
  marquee: { a: Pt; b: Pt } | null
}): ReactElement {
  const pct = (p: Pt): { left: string; top: string } => ({
    left: `${(p.x / scene.width) * 100}%`,
    top: `${(p.y / scene.height) * 100}%`,
  })
  // the overlay lives inside the zoom transform: divide by the effective scale to keep strokes
  // screen-constant, and counter-scale the DOM knobs by 1/zoom
  const eff = fit.scale * zoom
  const sw = 1.5 / eff
  const knobT = `translate(-50%, -50%) scale(${1 / zoom})`
  return (
    <>
      <svg
        viewBox={`0 0 ${scene.width} ${scene.height}`}
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        fill="none"
      >
        {shapes.map((shape, i) => (
          <path
            key={i}
            d={shapePath(shape)}
            stroke="var(--accent)"
            strokeWidth={sw}
            strokeDasharray={`${6 / eff} ${4 / eff}`}
            opacity={shape === primaryShape ? 1 : 0.55}
          />
        ))}
        {guides?.xs.map((x, i) => (
          <line
            key={`gx${i}`}
            x1={x}
            y1={0}
            x2={x}
            y2={scene.height}
            stroke="var(--accent)"
            strokeWidth={sw / 1.5}
            strokeDasharray={`${3 / eff} ${5 / eff}`}
            opacity={0.8}
          />
        ))}
        {guides?.ys.map((y, i) => (
          <line
            key={`gy${i}`}
            x1={0}
            y1={y}
            x2={scene.width}
            y2={y}
            stroke="var(--accent)"
            strokeWidth={sw / 1.5}
            strokeDasharray={`${3 / eff} ${5 / eff}`}
            opacity={0.8}
          />
        ))}
        {marquee !== null && (
          <rect
            x={Math.min(marquee.a.x, marquee.b.x)}
            y={Math.min(marquee.a.y, marquee.b.y)}
            width={Math.abs(marquee.a.x - marquee.b.x)}
            height={Math.abs(marquee.a.y - marquee.b.y)}
            stroke="var(--accent)"
            strokeWidth={sw}
            fill="var(--accent-soft, rgba(129, 140, 248, 0.15))"
          />
        )}
        {primaryShape !== null && arm !== null && (
          <line
            x1={shapeCenter(primaryShape).x}
            y1={shapeCenter(primaryShape).y}
            x2={arm.x}
            y2={arm.y}
            stroke="var(--accent)"
            strokeWidth={sw}
          />
        )}
      </svg>
      {primaryShape !== null && arm !== null && (
        <span
          className="bg-panel border-accent-line absolute h-3 w-3 rounded-full border-2"
          style={{ ...pct(arm), transform: knobT }}
        />
      )}
      {primaryShape !== null && scaleAt !== null && (
        <span
          className="border-accent-line bg-panel absolute h-3 w-3 rounded-sm border-2"
          style={{ ...pct(scaleAt), transform: knobT }}
        />
      )}
      {ticks.map((t, i) => (
        <span
          key={i}
          className="border-accent-text bg-panel absolute h-3 w-3 rounded-sm border-2"
          style={{ ...pct(t.at), transform: `${knobT} rotate(45deg)` }}
        />
      ))}
      {handles.map((h) => (
        <HandleKnob key={h.id} at={h.at} pct={pct} knobT={knobT} dark={h.id === 'radial-focus'} />
      ))}
    </>
  )
}

function HandleKnob({
  at,
  pct,
  knobT,
  dark,
}: {
  at: Pt
  pct: (p: Pt) => { left: string; top: string }
  knobT: string
  dark: boolean
}): ReactElement {
  return (
    <span
      className={`absolute h-3.5 w-3.5 rounded-full border-2 shadow-sm ${
        dark ? 'border-accent-text bg-accent-soft' : 'border-accent-line bg-panel'
      }`}
      style={{ ...pct(at), transform: knobT }}
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
