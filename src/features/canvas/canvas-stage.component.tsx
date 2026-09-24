import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'

import { brushAnchor, brushOffsets } from '../../engine/brush.ts'
import {
  bufferWidth,
  STAGE_THEMES,
  docExtent,
  resolveColor,
  type Doc,
  type StageTheme,
  type Link,
  type SymmetryState,
} from '../../engine/doc.ts'
import { applyFillStyle, patternCoord } from '../../engine/fillpatterns.ts'
import {
  buildGeometry,
  stagingPreview,
  PENDING_OBJ,
  type Geometry,
  type Staging,
} from '../../engine/geometry.ts'
import { makeGrid, type Grid } from '../../engine/grids.ts'
import { marchingSquares, type Pt } from '../../engine/marching-squares.ts'
import { drawGeometry } from '../../engine/png.ts'
import { nodeProtected, objLayer, type SceneLayer } from '../../engine/scene.ts'
import { scrollbarMetrics } from '../../engine/scrollbars.ts'
import { regionCells, pointInPolys, fillCellsEvenOdd } from '../../engine/shapefill.ts'
import {
  ellipsePoints,
  isShapeTool,
  linePoints,
  rectPoints,
  shapePathPoints,
  shapePathSegments,
  shapeHasHoles,
  shapePathLoops,
} from '../../engine/shapes.ts'
import {
  angleInFilledWedge,
  isRepeat,
  polarAngleMaps,
  repeatDef,
  symmetryPairPoints,
  symmetryPoints,
  symmetryTransforms,
} from '../../engine/symmetry.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { Tooltip } from '../../shared/ui/tooltip.component.tsx'
import { useStore } from '../../state/editor.store.ts'

/** Safety cap: one stamp event writes at most this many buffer cells */
const MAX_STAMPS = 20_000

/** Overlay scrollbar thickness in px. */
const SCROLLBAR = 10

/** Marching-ants dash travel speed, in screen px per second. */
const ANTS_SPEED = 30

/**
 * A compact lattice blob of `count` cells around the anchor: brush tips are square-grid concepts,
 * so on hex/triangle/radial grids a size-N brush paints the N² nearest cells (greedy
 * nearest-frontier growth, deterministic).
 */
function blobCells(grid: Grid, anchor: number, count: number): number[] {
  const set = new Set<number>([anchor])
  if (count <= 1 || anchor < 0) return [...set]
  const c0 = grid.center(anchor)
  while (set.size < count) {
    let best = -1
    let bestD = Infinity
    for (const i of set) {
      for (const j of grid.edgeNeighbors(i)) {
        if (set.has(j)) continue
        const c = grid.center(j)
        const d = (c.x - c0.x) * (c.x - c0.x) + (c.y - c0.y) * (c.y - c0.y)
        if (d < bestD) {
          bestD = d
          best = j
        }
      }
    }
    if (best < 0) break
    set.add(best)
  }
  return [...set]
}

function polyPath(p: Path2D, poly: Pt[]): void {
  p.moveTo(poly[0].x, poly[0].y)
  for (let k = 1; k < poly.length; k++) p.lineTo(poly[k].x, poly[k].y)
  p.closePath()
}

interface DragState {
  kind: 'pan' | 'draw' | 'shape' | 'move'
  sx?: number
  sy?: number
  panX?: number
  panY?: number
  start?: [number, number]
  last?: number
  removedLinks?: Set<number>
  /** Move drag: snapshot of the selected cells [index, value, element id] plus last offset */
  moved?: [number, number, number][]
  dx?: number
  dy?: number
}

interface Hover {
  idx: number
}

interface DocPoint {
  x: number
  y: number
}

function drawGuides(
  ctx: CanvasRenderingContext2D,
  view: { zoom: number; x: number; y: number },
  sym: SymmetryState,
  theme: StageTheme,
  W: number,
  H: number,
  sub: number,
): void {
  // called inside the overlay effect's doc-space transform (translate+scale already applied) —
  // only isolate drawing state here, or the doubled transform would push guides off-canvas
  ctx.save()
  ctx.strokeStyle = theme.guide
  ctx.lineWidth = 1 / view.zoom
  ctx.setLineDash([5 / view.zoom, 5 / view.zoom])
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
  }
  const m = sym.mode
  if (m === 'mirrorX' || m === 'mirrorY' || m === 'quad' || m === 'diag8') {
    ctx.beginPath()
    if (m === 'mirrorX' || m === 'quad') line(W / 2, 0, W / 2, H)
    if (m === 'mirrorY' || m === 'quad') line(0, H / 2, W, H / 2)
    if (m === 'diag8') {
      // the 8-way orbit mirrors across both center axes and both diagonals
      line(W / 2, 0, W / 2, H)
      line(0, H / 2, W, H / 2)
      line(0, 0, W, H)
      line(W, 0, 0, H)
    }
    ctx.stroke()
  }
  if (m === 'radial' || m === 'kaleido') {
    const cx = W / 2
    const cy = H / 2
    const R = (Math.max(W, H) / 2) * 1.2
    ctx.beginPath()
    for (let k = 0; k < sym.n; k++) {
      const a = (k * 2 * Math.PI) / sym.n
      line(cx, cy, cx + R * Math.cos(a), cy + R * Math.sin(a))
    }
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, Math.min(W, H) / 2, 0, 2 * Math.PI)
    ctx.stroke()
    // highlight the paintable part of the base sector when fill/phase reshape it
    const fill = Math.max(0, Math.min(100, sym.fill)) / 100
    if (fill < 1 || sym.phase !== 0) {
      const w = (2 * Math.PI) / Math.max(2, sym.n)
      const ph = (sym.phase * Math.PI) / 180
      ctx.beginPath()
      line(cx, cy, cx + R * Math.cos(ph), cy + R * Math.sin(ph))
      line(cx, cy, cx + R * Math.cos(ph + w * fill), cy + R * Math.sin(ph + w * fill))
      ctx.stroke()
    }
  }
  if (isRepeat(m)) {
    const def = repeatDef(m)
    if (def) {
      const bw = W * sub
      const bh = H * sub
      const c = Math.max(2, Math.min(sym.cell, bw, bh))
      const s = c / sub
      const A: [number, number] = [def.A[0] * s, def.A[1] * s]
      const B: [number, number] = [def.B[0] * s, def.B[1] * s]
      /** Lines parallel to `dir` through points k·offset, covering the canvas */
      const family = (dir: [number, number], offset: [number, number]) => {
        const n: [number, number] = [-dir[1], dir[0]]
        const step = offset[0] * n[0] + offset[1] * n[1]
        if (Math.abs(step) < 1e-9) return
        const corners = [0, W * n[0], H * n[1], W * n[0] + H * n[1]]
        // the step along n can be negative (e.g. brick/halfdrop) — flip the range, or the
        // family silently draws no lines at all
        const cMin = Math.min(...corners)
        const cMax = Math.max(...corners)
        const kMin = Math.floor((step > 0 ? cMin : cMax) / step) - 1
        const kMax = Math.ceil((step > 0 ? cMax : cMin) / step) + 1
        const len = Math.hypot(dir[0], dir[1])
        const ux = dir[0] / len
        const uy = dir[1] / len
        const L = W + H
        ctx.beginPath()
        for (let k = kMin; k <= kMax; k++) {
          const px = k * offset[0]
          const py = k * offset[1]
          line(px - L * ux, py - L * uy, px + L * ux, py + L * uy)
        }
        ctx.stroke()
      }
      family(B, A)
      family(A, B)

      // extra mirror-axis families (directions not parallel to a basis vector)
      if (def.mirrors) {
        const par = (d: [number, number], v: [number, number]) =>
          Math.abs(d[0] * v[1] - d[1] * v[0]) < 1e-9
        const pad = Math.abs(A[0]) + Math.abs(A[1]) + Math.abs(B[0]) + Math.abs(B[1])
        const x0 = -pad
        const y0 = -pad
        const x1 = W + pad
        const y1 = H + pad
        const det = A[0] * B[1] - A[1] * B[0]
        const iMin =
          Math.floor(Math.min((B[1] * x0 - B[0] * y0) / det, (B[1] * x1 - B[0] * y1) / det)) - 1
        const iMax =
          Math.ceil(Math.max((B[1] * x0 - B[0] * y0) / det, (B[1] * x1 - B[0] * y1) / det)) + 1
        const jMin =
          Math.floor(Math.min((A[0] * y0 - A[1] * x0) / det, (A[0] * y1 - A[1] * x1) / det)) - 1
        const jMax =
          Math.ceil(Math.max((A[0] * y0 - A[1] * x0) / det, (A[0] * y1 - A[1] * x1) / det)) + 1
        for (const d0 of def.mirrors) {
          if (par(d0, A) || par(d0, B)) continue
          if ((iMax - iMin) * (jMax - jMin) > 1600) continue
          const len = Math.hypot(d0[0], d0[1])
          const ux = d0[0] / len
          const uy = d0[1] / len
          const L = W + H
          ctx.beginPath()
          for (let i = iMin; i <= iMax; i++) {
            for (let j = jMin; j <= jMax; j++) {
              const px = i * A[0] + j * B[0]
              const py = i * A[1] + j * B[1]
              line(px - L * ux, py - L * uy, px + L * ux, py + L * uy)
            }
          }
          ctx.stroke()
        }
      }
    }
  }
  ctx.restore()
}

/** 1×1 doc-unit tile with four 0.5-unit checker halves, per theme. */
const checkerTiles: Partial<Record<'dark' | 'light', HTMLCanvasElement>> = {}
function checkerTileFor(theme: 'dark' | 'light', stage: StageTheme): HTMLCanvasElement {
  let tile = checkerTiles[theme]
  if (!tile) {
    tile = document.createElement('canvas')
    tile.width = 4
    tile.height = 4
    const g = tile.getContext('2d')
    if (g) {
      g.fillStyle = stage.checkerA
      g.fillRect(0, 0, 4, 4)
      g.fillStyle = stage.checkerB
      g.fillRect(2, 0, 2, 2)
      g.fillRect(0, 2, 2, 2)
    }
    checkerTiles[theme] = tile
  }
  return tile
}

/** Match a canvas backing store to the wrapper size (DPR-aware); returns null when hidden. */
function sizeCanvas(
  canvas: HTMLCanvasElement,
  wrap: HTMLElement,
): { dpr: number; w: number; h: number } | null {
  const dpr = window.devicePixelRatio || 1
  const w = wrap.clientWidth
  const h = wrap.clientHeight
  if (w === 0 || h === 0) return null
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
  }
  return { dpr, w, h }
}

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
  const paintCells = useStore((s) => s.paintCells)
  const paintCellsValues = useStore((s) => s.paintCellsValues)
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

  const isSquare = doc.gridType === 'square'
  const grid = useMemo(
    () => makeGrid(doc.gridType, doc.cols, doc.rows, doc.radialEven),
    [doc.gridType, doc.cols, doc.rows, doc.radialEven],
  )
  // rosette drawing knobs (fill/phase/twist), only meaningful for the radial modes
  const radialOpts = useMemo(
    () =>
      symmetry.mode === 'radial' || symmetry.mode === 'kaleido'
        ? { fill: symmetry.fill, phase: symmetry.phase, twist: symmetry.twist }
        : undefined,
    [symmetry.mode, symmetry.fill, symmetry.phase, symmetry.twist],
  )
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

  // ---- staging (in-stroke preview, not part of history) ----
  const stagingRef = useRef<Staging | null>(null)
  // set by stampShape for shape strokes: the pre-resolved doc (palette may gain the fill
  // and stroke colors) that commitStaging must pass to paintCellsValues, then cleared
  const shapeResolvedRef = useRef<Doc | null>(null)
  const [stagingVersion, bumpStaging] = useReducer((x: number) => x + 1, 0)
  const rafRef = useRef(0)
  const scheduleStaging = useCallback(() => {
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0
        bumpStaging()
      })
    }
  }, [])
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

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
  // shape drag endpoints for the parametric auto-graph (start from pointerdown, last from move)
  const shapeStartRef = useRef<[number, number] | null>(null)
  const shapeLastRef = useRef<[number, number] | null>(null)

  const bw = bufferWidth(doc)
  const bh = doc.rows * doc.sub
  const tipOffsets = useMemo(() => brushOffsets(brush), [brush])

  const colorValueFor = useCallback(
    (hex: string) => {
      const i = doc.palette.indexOf(hex.toLowerCase())
      return i === -1 ? doc.palette.length + 1 : i + 1
    },
    [doc.palette],
  )

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

  const ensureStaging = () => {
    // links stays undefined: paint strokes preview over the committed connectors, and only
    // link edits (eraser over links, connector tool, move) assign staging.links explicitly
    if (!stagingRef.current)
      stagingRef.current = {
        cells: new Map<number, number | null>(),
        objs: new Map<number, number | null>(),
        layerId: activeLayerState().id ?? undefined,
      }
    const st = stagingRef.current as {
      cells: Map<number, number | null>
      links?: Link[]
      objs: Map<number, number | null>
      palette?: readonly string[]
      layerId?: number
    }
    if (!st.objs) st.objs = new Map()
    if (st.layerId === undefined) st.layerId = activeLayerState().id ?? undefined
    return st
  }

  /** Symmetry orbit of a single cell index (per-point copies) */
  const expand = useCallback(
    (idx: number): number[] => {
      if (isSquare) {
        const bx = idx % bw
        const by = Math.floor(idx / bw)
        return symmetryPoints(
          bx,
          by,
          bw,
          bh,
          symmetry.mode,
          symmetry.n,
          symmetry.cell,
          radialOpts,
        ).map(([x, y]) => y * bw + x)
      }
      const maps = polarAngleMaps(symmetry.mode, symmetry.n, radialOpts)
      if (maps.length === 0) return [idx]
      const base = grid.angleOf(idx)
      // radial sector gate: nothing is painted outside the filled wedge
      if (radialOpts && !angleInFilledWedge(base, symmetry.n, radialOpts)) return []
      const out = new Set<number>([idx])
      const r = grid.radiusOf(idx)
      for (const f of maps) {
        const j = grid.cellByAngle(idx, f(base, r))
        if (j >= 0) out.add(j)
      }
      return [...out]
    },
    [isSquare, bw, bh, symmetry, grid, radialOpts],
  )

  /** Symmetry copies of a cell pair under the polar maps (non-square connector/shape pairs) */
  const polarPairs = useCallback(
    (aIdx: number, bIdx: number): [number, number][] => {
      const maps = polarAngleMaps(symmetry.mode, symmetry.n, radialOpts)
      if (maps.length === 0) return []
      const out: [number, number][] = []
      const seen = new Set<number>([aIdx])
      const aa = grid.angleOf(aIdx)
      const ab = grid.angleOf(bIdx)
      for (const f of maps) {
        const ia = grid.cellByAngle(aIdx, f(aa, grid.radiusOf(aIdx)))
        const ib = grid.cellByAngle(bIdx, f(ab, grid.radiusOf(bIdx)))
        if (ia >= 0 && ib >= 0 && !seen.has(ia)) {
          seen.add(ia)
          out.push([ia, ib])
        }
      }
      return out
    },
    [symmetry, grid, radialOpts],
  )

  /** Doc-space distance² from point to the connector segment */
  const linkDistSq = (l: Link, p: DocPoint): number => {
    let ax: number, ay: number, bx: number, by: number
    if (isSquare) {
      ax = l.ax + 0.5
      ay = l.ay + 0.5
      bx = l.bx + 0.5
      by = l.by + 0.5
    } else {
      const a = grid.center(l.ax)
      const b = grid.center(l.bx)
      ax = a.x
      ay = a.y
      bx = b.x
      by = b.y
    }
    const abx = bx - ax
    const aby = by - ay
    const len2 = abx * abx + aby * aby
    let t = len2 > 0 ? ((p.x - ax) * abx + (p.y - ay) * aby) / len2 : 0
    t = Math.max(0, Math.min(1, t))
    const dx = p.x - (ax + t * abx)
    const dy = p.y - (ay + t * aby)
    return dx * dx + dy * dy
  }

  /** Connector links plus their symmetry copies (both endpoints mapped by the same copy) */
  const connectorCopies = useCallback(
    (a: { ax: number; ay: number }, b: { ax: number; ay: number }): Link[] => {
      const out: Link[] = []
      if (isSquare) {
        const sub = doc.sub
        for (const [pax, pay, pbx, pby] of symmetryPairPoints(
          a.ax * sub,
          a.ay * sub,
          b.ax * sub,
          b.ay * sub,
          bw,
          bh,
          symmetry.mode,
          symmetry.n,
          symmetry.cell,
          radialOpts,
        )) {
          out.push({
            ax: Math.floor(pax / sub),
            ay: Math.floor(pay / sub),
            bx: Math.floor(pbx / sub),
            by: Math.floor(pby / sub),
            v: 0,
          })
        }
      } else {
        out.push({ ax: a.ax, ay: 0, bx: b.ax, by: 0, v: 0 })
        for (const [ia, ib] of polarPairs(a.ax, b.ax)) {
          out.push({ ax: ia, ay: 0, bx: ib, by: 0, v: 0 })
        }
      }
      return out
    },
    [isSquare, doc.sub, bw, bh, symmetry, polarPairs, radialOpts],
  )

  const stampCells = useCallback(
    (idxs: number[], erase: boolean, dragState: DragState, pDoc: DocPoint | null) => {
      const st = ensureStaging()
      const v = colorValueFor(color)
      for (const idx of idxs) {
        st.cells.set(idx, erase ? null : v)
        if (!erase) st.objs!.set(idx, PENDING_OBJ)
      }
      if (erase && pDoc && doc.links.length > 0) {
        const hit = (0.5 + doc.connectorWidth / 2) ** 2
        doc.links.forEach((l, i) => {
          if (!dragState.removedLinks!.has(i) && linkDistSq(l, pDoc) < hit) {
            dragState.removedLinks!.add(i)
          }
        })
        st.links = doc.links.filter((_, i) => !dragState.removedLinks!.has(i))
      }
      scheduleStaging()
    },
    [isSquare, grid, colorValueFor, color, doc.links, doc.connectorWidth, scheduleStaging],
  )

  /**
   * Stamp the brush tip under the pointer: the anchor cell comes from the pixel-size grid (snapped)
   * or sits centered under the cursor (Alt), the tip pattern is stamped at every symmetry copy of
   * the anchor. Square grids use the tip pattern; other grids paint a compact lattice blob of size²
   * cells.
   */
  const stampBrush = useCallback(
    (idx: number, erase: boolean, dragState: DragState, pDoc: DocPoint | null, free: boolean) => {
      if (idx < 0 || idx >= grid.count) return
      const idxs: number[] = []
      const seen = new Set<number>()
      const push = (i: number) => {
        if (i >= 0 && i < grid.count && !seen.has(i)) {
          seen.add(i)
          idxs.push(i)
        }
      }
      if (isSquare) {
        const bx = idx % bw
        const by = Math.floor(idx / bw)
        const [ax, ay] = brushAnchor(bx, by, brush.size, brushSnap && !free)
        const orbit = symmetryPoints(
          ax,
          ay,
          bw,
          bh,
          symmetry.mode,
          symmetry.n,
          symmetry.cell,
          radialOpts,
        )
        // keep orbit × tip within the stamp budget on huge repeat lattices
        const cap = Math.max(64, Math.floor(MAX_STAMPS / tipOffsets.length))
        for (const [ox, oy] of orbit.slice(0, cap)) {
          for (const [dx, dy] of tipOffsets) {
            const x = ox + dx
            const y = oy + dy
            if (x >= 0 && y >= 0 && x < bw && y < bh) push(y * bw + x)
          }
        }
      } else {
        const blob = blobCells(grid, idx, brush.size * brush.size)
        for (const bi of blob) {
          for (const si of expand(bi)) push(si)
        }
      }
      stampCells(idxs, erase, dragState, pDoc)
    },
    [
      grid,
      grid.count,
      isSquare,
      bw,
      bh,
      brush.size,
      brushSnap,
      symmetry,
      tipOffsets,
      expand,
      stampCells,
      radialOpts,
    ],
  )

  /** Stamp the tip pattern at one buffer anchor, bounds-checked */
  const stampTipInto = useCallback(
    (
      st: { cells: Map<number, number | null>; objs: Map<number, number | null> },
      v: number,
      ax: number,
      ay: number,
    ) => {
      for (const [dx, dy] of tipOffsets) {
        const x = ax + dx
        const y = ay + dy
        if (x >= 0 && y >= 0 && x < bw && y < bh) {
          st.cells.set(y * bw + x, v)
          st.objs.set(y * bw + x, PENDING_OBJ)
        }
      }
    },
    [tipOffsets, bw, bh],
  )

  const stampShape = useCallback(
    (start: DocPoint, end: DocPoint, free: boolean) => {
      const st = ensureStaging()
      st.cells.clear()
      st.objs!.clear()
      st.palette = undefined
      shapeResolvedRef.current = null
      const shapeLike = tool === 'rect' || tool === 'ellipse' || isShapeTool(tool)
      // resolve every color the shape will paint up front: the staged values point at
      // the future palette, so the preview and the commit share one set of numbers
      let resolved = doc
      let vStroke = colorValueFor(color)
      let vFillMain = 0
      let vFillSecond = 0
      if (shapeLike) {
        const rS = resolveColor(doc, shapePaint.stroke ? shapePaint.strokeColor || color : color)
        resolved = rS.doc
        vStroke = rS.v
        if (shapePaint.fill !== 'none') {
          const rA = resolveColor(resolved, color)
          resolved = rA.doc
          vFillMain = rA.v
          if (shapePaint.fill === 'pattern') {
            const rB = resolveColor(resolved, fillStyle.color2)
            resolved = rB.doc
            vFillSecond = rB.v
          }
        }
        st.palette = resolved.palette
        shapeResolvedRef.current = resolved
      }
      const stampCell = (i: number, val: number) => {
        st.cells.set(i, val)
        st.objs!.set(i, PENDING_OBJ)
      }
      /** Even-odd fill of a hole-bearing copy (skull); null for regular shapes */
      const holeFillFor = (a: [number, number], b: [number, number]) =>
        isShapeTool(tool) && shapeHasHoles(tool)
          ? fillCellsEvenOdd(
              shapePathLoops(tool, a[0], a[1], b[0], b[1], {
                ...toolOpts,
                circles: concentricRadii,
              }),
              bw,
              bh,
            )
          : null
      /** Fill + aligned stroke of one rasterized copy (square grid) */
      const emitSquareCopy = (outlinePts: [number, number][], holeFill?: Set<number> | null) => {
        const outlineSet = new Set(outlinePts.map(([x, y]) => y * bw + x))
        let inside: Set<number> | null = null
        let outside: Set<number> | null = null
        if (holeFill) {
          inside = holeFill
        } else if (shapePaint.fill !== 'none' || shapePaint.align !== 'center') {
          const region = regionCells(outlineSet, bw, bh)
          inside = region.inside
          outside = region.outside
        }
        if (shapePaint.fill !== 'none') {
          // the boundary belongs to the fill too: with the stroke off the silhouette
          // stays closed, with it on the stroke paints over the boundary
          if (shapePaint.fill === 'pattern') {
            const regionIdx = [...outlineSet, ...inside!]
            const seed = outlinePts[0][1] * bw + outlinePts[0][0]
            const picks = applyFillStyle(fillStyle, regionIdx, seed, patternCoord(resolved))
            for (const [i, pick] of picks) stampCell(i, pick === 1 ? vFillSecond : vFillMain)
          } else {
            for (const i of inside!) stampCell(i, vFillMain)
            for (const i of outlineSet) stampCell(i, vFillMain)
          }
        }
        if (shapePaint.stroke) {
          for (const [px, py] of outlinePts) {
            for (const [dx, dy] of tipOffsets) {
              const x = px + dx
              const y = py + dy
              if (x < 0 || y < 0 || x >= bw || y >= bh) continue
              const i = y * bw + x
              // alignment filters the tip blob against the shape's own regions
              const keep =
                shapePaint.align === 'center'
                  ? true
                  : shapePaint.align === 'inner'
                    ? !outside!.has(i)
                    : !inside!.has(i)
              if (keep) stampCell(i, vStroke)
            }
          }
        }
      }
      if (isSquare) {
        // shape endpoints snap to the pixel-size grid like brush anchors
        const pt = (p: DocPoint): [number, number] => {
          const bx = Math.floor(p.x * doc.sub)
          const by = Math.floor(p.y * doc.sub)
          if (brush.size === 1 || !(brushSnap && !free)) return [bx, by]
          return brushAnchor(bx, by, brush.size, true)
        }
        const s0 = pt(start)
        const s1 = pt(end)
        const rasterize = (a: [number, number], b: [number, number]) =>
          tool === 'line'
            ? linePoints(a[0], a[1], b[0], b[1])
            : tool === 'rect'
              ? rectPoints(a[0], a[1], b[0], b[1], toolOpts)
              : isShapeTool(tool)
                ? shapePathPoints(tool, a[0], a[1], b[0], b[1], {
                    ...toolOpts,
                    circles: concentricRadii,
                  })
                : ellipsePoints(a[0], a[1], b[0], b[1], toolOpts)
        const transforms = symmetryTransforms(bw, bh, symmetry.mode, symmetry.n, radialOpts)
        if (transforms) {
          // finite modes: map the defining points through every copy and re-rasterize,
          // so each copy is a correctly drawn shape instead of a mirrored raster
          const copies: [number, number, number, number][] = [[s0[0], s0[1], s1[0], s1[1]]]
          for (const t of transforms) {
            const a = t(s0[0], s0[1])
            const b = t(s1[0], s1[1])
            copies.push([a[0], a[1], b[0], b[1]])
          }
          for (const [ax, ay, bx, by] of copies) {
            if (shapeLike) {
              emitSquareCopy(rasterize([ax, ay], [bx, by]), holeFillFor([ax, ay], [bx, by]))
            } else {
              for (const [px, py] of rasterize([ax, ay], [bx, by]))
                stampTipInto(st, vStroke, px, py)
            }
          }
        } else {
          // repeat/wallpaper modes: classify the primary copy, then expand every kept
          // cell through its symmetry orbit
          const outlinePts = rasterize(s0, s1)
          if (shapeLike) {
            const cap = Math.max(64, Math.floor(MAX_STAMPS / Math.max(1, tipOffsets.length)))
            const outlineSet = new Set(outlinePts.map(([x, y]) => y * bw + x))
            const region = regionCells(outlineSet, bw, bh)
            const hf = holeFillFor(s0, s1)
            if (hf) region.inside = hf
            const orbitOf = (x: number, y: number) =>
              symmetryPoints(x, y, bw, bh, symmetry.mode, symmetry.n, symmetry.cell, radialOpts)
            if (shapePaint.fill !== 'none') {
              if (shapePaint.fill === 'pattern') {
                const regionArr = [...outlineSet, ...region.inside]
                const seed = outlinePts[0][1] * bw + outlinePts[0][0]
                const picks = applyFillStyle(fillStyle, regionArr, seed, patternCoord(resolved))
                for (const [i, pick] of picks) {
                  const x = i % bw
                  const y = (i - x) / bw
                  for (const [ox, oy] of orbitOf(x, y).slice(0, cap))
                    stampCell(oy * bw + ox, pick === 1 ? vFillSecond : vFillMain)
                }
              } else {
                for (const i of [...region.inside, ...outlineSet]) {
                  const x = i % bw
                  const y = (i - x) / bw
                  for (const [ox, oy] of orbitOf(x, y).slice(0, cap))
                    stampCell(oy * bw + ox, vFillMain)
                }
              }
            }
            if (shapePaint.stroke) {
              for (const [px, py] of outlinePts) {
                for (const [dx, dy] of tipOffsets) {
                  const x = px + dx
                  const y = py + dy
                  if (x < 0 || y < 0 || x >= bw || y >= bh) continue
                  const i = y * bw + x
                  const keep =
                    shapePaint.align === 'center'
                      ? true
                      : shapePaint.align === 'inner'
                        ? !region.outside.has(i)
                        : !region.inside.has(i)
                  if (!keep) continue
                  for (const [ox, oy] of orbitOf(x, y).slice(0, cap))
                    stampCell(oy * bw + ox, vStroke)
                }
              }
            }
          } else {
            const cap = Math.max(64, Math.floor(MAX_STAMPS / tipOffsets.length))
            for (const [px, py] of outlinePts) {
              const orbit = symmetryPoints(
                px,
                py,
                bw,
                bh,
                symmetry.mode,
                symmetry.n,
                symmetry.cell,
                radialOpts,
              )
              for (const [ox, oy] of orbit.slice(0, cap)) stampTipInto(st, vStroke, ox, oy)
            }
          }
        }
      } else {
        // sample the outline in doc space, stamp the brush blob through grid symmetry
        const idxs = new Set<number>()
        // float polylines of the shape (doc space): interior test for the fill
        const outlinePolys: [number, number][][] = []
        const sampleSeg = (a: DocPoint, b: DocPoint) => {
          const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * doc.sub * 6))
          for (let s = 0; s <= steps; s++) {
            const x = a.x + ((b.x - a.x) * s) / steps
            const y = a.y + ((b.y - a.y) * s) / steps
            const idx = grid.cellAt(x, y)
            if (idx >= 0) idxs.add(idx)
          }
        }
        if (tool === 'line') {
          sampleSeg(start, end)
        } else if (tool === 'rect') {
          outlinePolys.push([
            [start.x, start.y],
            [end.x, start.y],
            [end.x, end.y],
            [start.x, end.y],
            [start.x, start.y],
          ])
          sampleSeg(start, { x: end.x, y: start.y })
          sampleSeg({ x: end.x, y: start.y }, end)
          sampleSeg(end, { x: start.x, y: end.y })
          sampleSeg({ x: start.x, y: end.y }, start)
        } else if (tool === 'ellipse') {
          const cx = (start.x + end.x) / 2
          const cy = (start.y + end.y) / 2
          const rx = Math.abs(end.x - start.x) / 2
          const ry = Math.abs(end.y - start.y) / 2
          const power = Math.min(8, Math.max(0.5, toolOpts.ellipsePower ?? 2))
          const e = 2 / power
          const loop: [number, number][] = []
          const steps = 96
          for (let s = 0; s <= steps; s++) {
            const a = (s / steps) * 2 * Math.PI
            const ct = Math.cos(a)
            const cts = Math.sign(ct) * Math.abs(ct) ** e
            const stt = Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** e
            const x = cx + rx * cts
            const y = cy + ry * stt
            loop.push([x, y])
            if (s < steps) {
              const idx = grid.cellAt(x, y)
              if (idx >= 0) idxs.add(idx)
            }
          }
          outlinePolys.push(loop)
        } else if (isShapeTool(tool)) {
          // sample the shape's outline pieces in doc space through the grid lookup
          const steps = Math.max(
            48,
            Math.ceil((Math.abs(end.x - start.x) + Math.abs(end.y - start.y)) * doc.sub * 2),
          )
          for (const poly of shapePathSegments(
            tool,
            start.x,
            start.y,
            end.x,
            end.y,
            toolOpts,
            steps,
          )) {
            outlinePolys.push(poly.map(([x, y]) => [x, y] as [number, number]))
            let prev = { x: poly[0][0], y: poly[0][1] }
            for (let i = 1; i < poly.length; i++) {
              const cur = { x: poly[i][0], y: poly[i][1] }
              sampleSeg(prev, cur)
              prev = cur
            }
          }
        }
        for (const idx of idxs) {
          const blob = brush.size > 1 ? blobCells(grid, idx, brush.size * brush.size) : [idx]
          for (const bi of blob) {
            for (const si of expand(bi)) {
              if (si >= 0 && si < grid.count) {
                st.cells.set(si, vStroke)
                st.objs!.set(si, PENDING_OBJ)
              }
            }
          }
        }
        if (shapeLike && shapePaint.fill !== 'none' && outlinePolys.length > 0) {
          // fill = every cell whose center sits inside the outline polylines (even-odd),
          // quick-rejected by the shape's bounding box
          let x0 = Infinity
          let y0 = Infinity
          let x1 = -Infinity
          let y1 = -Infinity
          for (const poly of outlinePolys) {
            for (const [x, y] of poly) {
              x0 = Math.min(x0, x)
              y0 = Math.min(y0, y)
              x1 = Math.max(x1, x)
              y1 = Math.max(y1, y)
            }
          }
          // pattern fills land as the solid main color here: per-cell dithering is a
          // square-grid concept (patternCoord indexes a rectangular buffer)
          for (let gi = 0; gi < grid.count; gi++) {
            const poly = grid.polygon(gi)
            let cx = 0
            let cy = 0
            let inBox = false
            for (const p of poly) {
              cx += p.x
              cy += p.y
              if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) inBox = true
            }
            if (!inBox) continue
            cx /= poly.length
            cy /= poly.length
            if (!pointInPolys(outlinePolys, cx, cy)) continue
            for (const si of expand(gi)) {
              if (si >= 0 && si < grid.count) stampCell(si, vFillMain)
            }
          }
        }
      }
      scheduleStaging()
    },
    [
      tool,
      colorValueFor,
      color,
      doc,
      doc.sub,
      brush.size,
      brushSnap,
      bw,
      bh,
      symmetry,
      grid,
      expand,
      stampTipInto,
      tipOffsets.length,
      scheduleStaging,
      radialOpts,
      toolOpts,
      concentricRadii,
      shapePaint,
      fillStyle,
    ],
  )

  /**
   * Fill scope on radial grids: a click can cover the whole sector wedge (every ring) or the whole
   * ring instead of one cell. Returns null when the plain cell scope applies.
   */
  const fillSeeds = useCallback(
    (idx: number): number[] | null => {
      if (doc.gridType !== 'radial' || fillScope === 'cell') return null
      const seeds: number[] = []
      if (fillScope === 'ring') {
        const r0 = grid.radiusOf(idx)
        for (let j = 0; j < grid.count; j++) {
          if (Math.abs(grid.radiusOf(j) - r0) < 0.5) seeds.push(j)
        }
        return seeds
      }
      // sector wedge: the clicked cell's angular span, evaluated in every ring
      const norm = (a: number) => {
        a = (a + Math.PI) % (2 * Math.PI)
        if (a < 0) a += 2 * Math.PI
        return a - Math.PI
      }
      const am = grid.angleOf(idx)
      let dMin = Infinity
      let dMax = -Infinity
      for (const p of grid.polygon(idx)) {
        const d = norm(Math.atan2(p.y - grid.h / 2, p.x - grid.w / 2) - am)
        dMin = Math.min(dMin, d)
        dMax = Math.max(dMax, d)
      }
      for (let j = 0; j < grid.count; j++) {
        const d = norm(grid.angleOf(j) - am)
        if (d >= dMin - 1e-6 && d <= dMax + 1e-6) seeds.push(j)
      }
      return seeds
    },
    [doc.gridType, fillScope, grid],
  )

  const commitStaging = useCallback(() => {
    const st = stagingRef.current
    stagingRef.current = null
    const erase = tool === 'eraser'
    if (st && st.cells && st.cells.size > 0) {
      const resolved = shapeResolvedRef.current
      shapeResolvedRef.current = null
      if (resolved) {
        // shape stroke: fill + stroke committed as one object with per-cell values;
        // single-color shapes commit as a parametric source node (live geometry)
        useStore.getState().pushRecent(color)
        let parametric:
          | { op: string; params: Record<string, number | string | boolean> }
          | undefined
        const start = shapeStartRef.current
        const last = shapeLastRef.current
        if (start && last) {
          const minX = Math.min(start[0], last[0])
          const minY = Math.min(start[1], last[1])
          const maxX = Math.max(start[0], last[0])
          const maxY = Math.max(start[1], last[1])
          const inkColor = shapePaint.stroke ? shapePaint.strokeColor || color : color
          const singleColor =
            shapePaint.fill === 'none' ? Boolean(shapePaint.stroke) : !shapePaint.stroke
          if (singleColor) {
            const base = { color: inkColor }
            if (tool === 'rect')
              parametric = {
                op: 'source.rect',
                params: {
                  ...base,
                  x: Math.round(minX),
                  y: Math.round(minY),
                  w: Math.max(1, Math.round(maxX - minX)),
                  h: Math.max(1, Math.round(maxY - minY)),
                },
              }
            else if (tool === 'ellipse')
              parametric = {
                op: 'source.ellipse',
                params: {
                  ...base,
                  cx: (minX + maxX) / 2,
                  cy: (minY + maxY) / 2,
                  rx: Math.max(0.5, (maxX - minX) / 2),
                  ry: Math.max(0.5, (maxY - minY) / 2),
                },
              }
            else if (tool === 'line')
              parametric = {
                op: 'source.line',
                params: {
                  ...base,
                  x0: Math.round(start[0]),
                  y0: Math.round(start[1]),
                  x1: Math.round(last[0]),
                  y1: Math.round(last[1]),
                },
              }
            else if (isShapeTool(tool))
              parametric = {
                op: 'source.shape',
                params: {
                  ...base,
                  shape: tool,
                  x: Math.round(minX),
                  y: Math.round(minY),
                  w: Math.max(3, Math.round(maxX - minX)),
                  h: Math.max(3, Math.round(maxY - minY)),
                  ...toolOpts,
                },
              }
          }
        }
        paintCellsValues(st.cells as Map<number, number>, resolved, parametric)
        // in element scope the fresh shape selects itself, Illustrator-style: move or
        // restyle it right away without an extra pick
        if (resolved.styleScope === 'element') {
          const first = st.cells.keys().next().value
          const obj = first == null ? 0 : (useStore.getState().doc.cellObj?.[first] ?? 0)
          if (obj > 0) selectElements([obj])
        }
      } else {
        paintCells(st.cells, erase ? '' : color, erase ? st.links : undefined)
      }
    } else if (st && st.links && erase) {
      // only connectors were removed during this stroke
      paintCells(new Map<number, number | null>(), '', st.links)
    }
    bumpStaging()
  }, [paintCells, paintCellsValues, selectElements, color, tool])

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
    if (idx >= 0) setHover({ idx })
    else setHover(null)
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
  useEffect(() => {
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
    stagingVersion,
  ])

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
      drawGuides(ctx, view, symmetry, stage, W, H, doc.sub)
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
        <div className="text-accent-text pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs backdrop-blur">
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
      <div className="text-body absolute right-3 bottom-3 flex items-center gap-2 rounded-lg bg-black/50 px-2 py-1 text-xs backdrop-blur">
        <Tooltip label={t('view.cursor.desc')}>
          <span className="text-muted font-mono">
            {hover
              ? `${
                  isSquare
                    ? `x:${Math.floor((hover.idx % bw) / doc.sub)} y:${Math.floor(Math.floor(hover.idx / bw) / doc.sub)} · `
                    : ''
                }i:${hover.idx}`
              : '—'}
          </span>
        </Tooltip>
        <span className="text-muted">{Math.round(view.zoom * 100)}%</span>
      </div>

      {/* fit canvas — bottom-left overlay (moved from the top bar) */}
      <button
        type="button"
        onClick={fit}
        title={`${t('top.fit')} (F)`}
        className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 rounded-md bg-black/50 px-2.5 py-1.5 text-[11px] text-white/80 backdrop-blur-sm transition hover:bg-black/70 hover:text-white"
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
