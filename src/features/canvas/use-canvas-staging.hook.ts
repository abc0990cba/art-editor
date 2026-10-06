import { useCallback, useEffect, useMemo, useRef } from 'react'

import {
  bufferWidth,
  resolveColor,
  type Doc,
  type Link,
  type SymmetryState,
} from '../../engine/core/doc.ts'
import { gridSymmetryOrbit, gridSymmetryPairs } from '../../engine/effects/symmetry-grid.ts'
import { symmetryPairPoints, symmetryPoints } from '../../engine/effects/symmetry.ts'
import { PENDING_OBJ, type Staging } from '../../engine/geometry/index.ts'
import { makeGrid, isPlainSquare } from '../../engine/grids/index.ts'
import { brushAnchor, brushOffsets } from '../../engine/paint/brush.ts'
import { pointInPolys } from '../../engine/shapes/fill.ts'
import { isShapeTool, shapePathSegments, shapeHasHoles } from '../../engine/shapes/index.ts'
import { useStore, type State } from '../../state/editor.store.ts'
import { MAX_STAMPS, blobCells, type DocPoint, type DragState } from './canvas-stage.util.ts'
import { fillSeedsFor } from './fill-seeds.util.ts'
import { shapeParametric, type ParametricSpec } from './shape-commit.util.ts'
import {
  beginShapeDrag,
  materializeShapeStaging,
  rasterSquareShape,
  type ShapeDragBuffer,
} from './stage-shape-raster.util.ts'
import { strokeLineCells } from './stroke-line.util.ts'

/** Inputs the in-stroke staging subsystem reads from the stage. */
export interface CanvasStagingParams {
  doc: Doc
  brush: State['brush']
  brushSnap: boolean
  symmetry: SymmetryState
  tool: State['tool']
  color: string
  fillScope: State['fillScope']
  toolOpts: State['toolOpts']
  concentricRadii: number[]
  shapePaint: State['shapePaint']
  fillStyle: State['fillStyle']
  /** Resolved active layer + protection, kept fresh by the stage */
  activeLayerState: () => { id: number | null; locked: boolean }
  /**
   * Direct per-frame redraw of the stage (base layer + overlay), called on the rAF tick after
   * staging mutations. Replaces the old reducer bump: stroke frames draw imperatively and never
   * re-render the stage component.
   */
  onStagingFrame: () => void
  /**
   * Runs after a commit painted into the store but before the post-commit frame: the stage
   * refreshes its geometry from the fresh document here, so the imperative frame right after
   * pointerup shows the committed stroke instead of one stale pre-commit frame.
   */
  onCommitPaint?: () => void
}

/**
 * In-stroke staging subsystem: builds the non-history preview (staged cells/objects/links) for
 * brush, shape, fill and connector strokes, and commits it into the store as one undoable step.
 * Pure bookkeeping around the store's paint actions — no rendering.
 */
export function useCanvasStaging({
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
  onStagingFrame,
  onCommitPaint,
}: CanvasStagingParams) {
  const paintCells = useStore((s) => s.paintCells)
  const paintCellsValues = useStore((s) => s.paintCellsValues)
  const selectElements = useStore((s) => s.selectElements)

  // a rotated square paints through the generic lattice paths like every other grid
  const gridRotation = doc.gridRotation ?? 0
  const isSquare = isPlainSquare(doc)
  const grid = useMemo(
    () => makeGrid(doc.gridType, doc.cols, doc.rows, doc.radialEven, gridRotation),
    [doc.gridType, doc.cols, doc.rows, doc.radialEven, gridRotation],
  )
  // rosette drawing knobs (fill/phase/twist), only meaningful for the radial modes
  const radialOpts = useMemo(
    () =>
      symmetry.mode === 'radial' || symmetry.mode === 'kaleido'
        ? { fill: symmetry.fill, phase: symmetry.phase, twist: symmetry.twist }
        : undefined,
    [symmetry.mode, symmetry.fill, symmetry.phase, symmetry.twist],
  )
  const bw = bufferWidth(doc)
  const bh = doc.rows * doc.sub
  const tipOffsets = useMemo(() => brushOffsets(brush), [brush])

  // shape drag endpoints for the parametric auto-graph (start from pointerdown, last from move)
  const shapeStartRef = useRef<[number, number] | null>(null)
  const shapeLastRef = useRef<[number, number] | null>(null)
  // free-drag flag of the shape stroke in progress: the commit must quantize the endpoints
  // with the same snapping rule the preview stamped with
  const shapeFreeRef = useRef<boolean>(false)

  const colorValueFor = useCallback(
    (hex: string) => {
      const i = doc.palette.indexOf(hex.toLowerCase())
      return i === -1 ? doc.palette.length + 1 : i + 1
    },
    [doc.palette],
  )

  // ---- staging (in-stroke preview, not part of history) ----
  const stagingRef = useRef<Staging | null>(null)
  // buffer indices stamped since the last composited frame: the canvas stroke layer drains
  // this per rAF and renders only the delta, so frames stay O(new cells) on long strokes
  const frameDeltaRef = useRef<number[] | null>(null)
  // set by stampShape for shape strokes: the pre-resolved doc (palette may gain the fill
  // and stroke colors) that commitStaging must pass to paintCellsValues, then cleared
  const shapeResolvedRef = useRef<Doc | null>(null)
  const onFrameRef = useRef(onStagingFrame)
  onFrameRef.current = onStagingFrame
  const rafRef = useRef(0)
  // rAF-coalesced imperative frame: staging mutations coalesce into at most one direct
  // draw per frame — React renders only when the stroke commits (or the view/doc changes)
  const scheduleStaging = useCallback(() => {
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0
        onFrameRef.current()
      })
    }
  }, [])
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])
  /** Immediate imperative frame (staging canceled / cleared). */
  const bumpStaging = useCallback(() => {
    onFrameRef.current()
  }, [])

  const ensureStaging = () => {
    // links stays undefined: paint strokes preview over the committed connectors, and only
    // link edits (eraser over links, connector tool, move) assign staging.links explicitly
    if (!stagingRef.current) {
      stagingRef.current = {
        cells: new Map<number, number | null>(),
        objs: new Map<number, number | null>(),
        layerId: activeLayerState().id ?? undefined,
      }
      frameDeltaRef.current = []
    }
    const st = stagingRef.current as {
      cells: Map<number, number | null>
      cellsBuf?: ShapeDragBuffer
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
      return gridSymmetryOrbit(grid, idx, symmetry, radialOpts)
    },
    [isSquare, bw, bh, symmetry, grid, radialOpts],
  )

  /** Symmetry copies of a cell pair under the grid maps (non-square connector/shape pairs) */
  const polarPairs = useCallback(
    (aIdx: number, bIdx: number): [number, number][] =>
      gridSymmetryPairs(grid, aIdx, bIdx, symmetry, radialOpts),
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
    (idxs: number[], erase: boolean, dragState: DragState, pDoc: DocPoint | null): number => {
      const st = ensureStaging()
      const v = colorValueFor(color)
      if (!erase && v > doc.palette.length) {
        // a color not in the palette yet: the commit appends it (resolveColor), but the staged
        // preview wraps values modulo the current palette — carry the future palette so the
        // stroke previews in its real color instead of palette[0]
        st.palette = [...doc.palette, color.toLowerCase()]
      }
      for (const idx of idxs) {
        st.cells.set(idx, erase ? null : v)
        if (!erase) st.objs!.set(idx, PENDING_OBJ)
      }
      const delta = frameDeltaRef.current
      if (delta) for (const idx of idxs) delta.push(idx)
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
      return idxs.length
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
      if (idx < 0 || idx >= grid.count) return 0
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
        // keep orbit × tip within the stamp budget on huge repeat lattices: the limit
        // short-circuits the lattice enumeration instead of slicing a 4K-point orbit after
        const cap = Math.max(64, Math.floor(MAX_STAMPS / tipOffsets.length))
        const orbit = symmetryPoints(
          ax,
          ay,
          bw,
          bh,
          symmetry.mode,
          symmetry.n,
          symmetry.cell,
          radialOpts,
          cap,
        )
        for (const [ox, oy] of orbit) {
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
      return stampCells(idxs, erase, dragState, pDoc)
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

  /**
   * Stamp the brush along the pointer's path since the previous move event (Bresenham anchors on
   * square grids, grid lookup sampling on lattices), capped to the per-event stamp budget so a fast
   * flick across a huge canvas cannot explode one event into millions of cell writes.
   */
  const stampStrokeLine = useCallback(
    (
      fromIdx: number,
      toIdx: number,
      opts: { erase: boolean; free: boolean },
      dragState: DragState,
      pDoc: DocPoint | null,
    ) => {
      let budget = MAX_STAMPS
      for (const idx of strokeLineCells(fromIdx, toIdx, isSquare, bw, grid)) {
        if (idx < 0 || idx >= grid.count) continue
        budget -= stampBrush(idx, opts.erase, dragState, pDoc, opts.free)
        if (budget <= 0) break
      }
    },
    [grid, isSquare, bw, stampBrush],
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
      shapeFreeRef.current = free
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
      if (isSquare) {
        // shape endpoints snap to the pixel-size grid like brush anchors; the raster
        // lands in the pooled typed drag buffer (Map/Set churn on million-cell shapes
        // cost hundreds of ms per move — see stage-shape-raster.util.ts)
        const pt = (p: DocPoint): [number, number] => {
          const bx = Math.floor(p.x * doc.sub)
          const by = Math.floor(p.y * doc.sub)
          if (brush.size === 1 || !(brushSnap && !free)) return [bx, by]
          return brushAnchor(bx, by, brush.size, true)
        }
        const s0 = pt(start)
        const s1 = pt(end)
        const buf = beginShapeDrag(doc.cells.length, bw, bh)
        st.cells = new Map()
        st.objs = new Map()
        st.cellsBuf = buf
        rasterSquareShape(buf, s0, s1, {
          tool,
          toolOpts,
          concentricRadii,
          shapePaint,
          fillStyle,
          resolved,
          vStroke,
          vFillMain,
          vFillSecond,
          tipOffsets,
          symmetry,
          radialOpts,
          shapeLike,
          hasHoles: isShapeTool(tool) && shapeHasHoles(tool),
        })
      } else {
        const stampCell = (i: number, val: number) => {
          st.cells.set(i, val)
          st.objs!.set(i, PENDING_OBJ)
        }
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
   * Fill scope beyond the single cell: square grids fill the whole doc-cell row/column (every
   * sub-cell), radial grids the sector wedge (every ring) or the whole ring. Returns null when the
   * plain cell scope applies.
   */
  const fillSeeds = useCallback(
    (idx: number): number[] | null => fillSeedsFor(idx, { fillScope, doc, grid, bw, bh, isSquare }),
    [bh, bw, doc, fillScope, grid, isSquare],
  )

  const commitStaging = useCallback(() => {
    const st = stagingRef.current
    stagingRef.current = null
    const erase = tool === 'eraser'
    // typed shape-drag buffers materialize into their Maps exactly once, here
    if (st) materializeShapeStaging(st)
    if (st && st.cells && st.cells.size > 0) {
      const resolved = shapeResolvedRef.current
      shapeResolvedRef.current = null
      if (resolved) {
        // shape stroke: fill + stroke committed as one object with per-cell values;
        // single-color shapes commit as a parametric source node (live geometry) whenever
        // the node reproduces the preview exactly, and as plain pixels otherwise
        useStore.getState().pushRecent(color)
        const start = shapeStartRef.current
        const last = shapeLastRef.current
        let parametric: ParametricSpec | undefined
        if (start && last) {
          const strokeOnly = shapePaint.fill === 'none'
          parametric = shapeParametric({
            tool,
            isSquare,
            sub: doc.sub,
            brushSize: brush.size,
            brushSnap,
            free: shapeFreeRef.current,
            strokeOnly,
            singleColor: strokeOnly ? Boolean(shapePaint.stroke) : !shapePaint.stroke,
            symmetryActive: symmetry.mode !== 'none',
            inkColor: shapePaint.stroke ? shapePaint.strokeColor || color : color,
            start,
            last,
            concentricRadii,
            toolOpts,
          })
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
    // the imperative frame after the commit must paint the committed document, not the
    // pre-commit geometry closure — the stage rebuilds its geometry from the fresh store here
    onCommitPaint?.()
    bumpStaging()
    // shapePaint/toolOpts decide whether the commit becomes a parametric node or
    // per-cell fill+stroke values — a stale closure here would drop the user's style
  }, [
    paintCells,
    paintCellsValues,
    selectElements,
    color,
    tool,
    shapePaint,
    toolOpts,
    doc.sub,
    brush.size,
    brushSnap,
    isSquare,
    concentricRadii,
    symmetry,
    bumpStaging,
    onCommitPaint,
  ])

  return {
    stagingRef,
    frameDeltaRef,
    bumpStaging,
    scheduleStaging,
    ensureStaging,
    expand,
    polarPairs,
    connectorCopies,
    stampCells,
    stampBrush,
    stampStrokeLine,
    stampTipInto,
    stampShape,
    fillSeeds,
    commitStaging,
    shapeResolvedRef,
    shapeStartRef,
    shapeLastRef,
    isSquare,
    grid,
    bw,
    bh,
    radialOpts,
    tipOffsets,
  }
}
