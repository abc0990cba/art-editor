/**
 * Multi-step canvas gestures extracted from the stage component: the connector tool's two-click
 * link (preview + commit) and the marquee resolution. Pure coordination over the store actions and
 * staging — the component stays under its size ratchet.
 */

import type { Doc, Link } from '../../engine/core/doc.ts'
import { objLayer } from '../../engine/core/scene.ts'
import type { Staging } from '../../engine/geometry/index.ts'
import type { Grid } from '../../engine/grids/index.ts'
import { useStore } from '../../state/editor.store.ts'
import {
  marqueeRect,
  objectsInMarquee,
  rectHasInk,
  type DocPoint,
  type DragState,
} from './canvas-stage.util.ts'
import { clickSelectionIds } from './select-hit.util.ts'
import type { XformHandle } from './selection-transform.util.ts'

/** Where a connector anchor lands for a pointer position (null = outside the canvas). */
export function linkAnchorAt(
  p: DocPoint,
  idx: number,
  isSquare: boolean,
  cols: number,
  rows: number,
): { ax: number; ay: number } | null {
  if (isSquare) {
    const px = Math.floor(p.x)
    const py = Math.floor(p.y)
    if (px < 0 || py < 0 || px >= cols || py >= rows) return null
    return { ax: px, ay: py }
  }
  return idx < 0 ? null : { ax: idx, ay: 0 }
}

export interface LinkGestureArgs {
  pendingLink: { ax: number; ay: number }
  p: DocPoint
  idx: number
  isSquare: boolean
  grid: Grid
  cols: number
  rows: number
  connectorCopies: (a: { ax: number; ay: number }, b: { ax: number; ay: number }) => Link[]
}

/** Second connector click: commit the link plus its symmetry copies. */
export function commitPendingLink(
  args: LinkGestureArgs,
  addLinks: (links: Link[], color: string) => void,
  color: string,
): void {
  const anchor = linkAnchorAt(args.p, args.idx, args.isSquare, args.cols, args.rows)
  if (!anchor) return
  addLinks(args.connectorCopies(args.pendingLink, anchor), color)
}

/** Between connector clicks: restage the preview link (with symmetry copies) under the pointer. */
export function previewPendingLink(
  args: LinkGestureArgs,
  links: readonly Link[],
  ensureStaging: () => Staging,
  scheduleStaging: () => void,
): void {
  const st = ensureStaging() as { cells: Map<number, number | null>; links?: Link[] }
  st.cells.clear()
  const anchor = linkAnchorAt(args.p, args.idx, args.isSquare, args.cols, args.rows)
  if (!anchor) return
  st.links = [...links, ...args.connectorCopies(args.pendingLink, anchor)]
  scheduleStaging()
}

export interface MarqueeResolveArgs {
  start: [number, number]
  end: DocPoint
  subtractive?: boolean
  additive?: boolean
  selection: number[]
  doc: Doc
  bw: number
  pickable: (id: number) => boolean
  removeFromSelection: (ids: number[]) => void
  selectElements: (ids: number[]) => void
  showScopeHint: () => void
}

/** Press surface of the selection transform box (structural slice of useSelectionTransform). */
interface XformPress {
  hit(
    p: DocPoint,
    zoom: number,
    touch: boolean,
  ): { kind: 'handle' | 'rotate'; handle: XformHandle } | null
  begin(kind: 'handle' | 'rotate', handle: XformHandle, p: DocPoint): boolean
}

export interface BeginSelectArgs {
  e: { pointerId: number; shiftKey: boolean; altKey: boolean }
  p: DocPoint
  /** Buffer cell under the press (-1 outside) */
  idx: number
  zoom: number
  touch: boolean
  doc: Doc
  selection: number[]
  activeLayerId: number | null
  isSquare: boolean
  xform: XformPress
  drag: { current: DragState | null }
  setDragKind: (k: DragState['kind'] | null) => void
  selectElements: (ids: number[]) => void
  removeFromSelection: (ids: number[]) => void
  clearSelection: () => void
  setActiveLayer: (id: number) => void
  pickable: (id: number) => boolean
  showScopeHint: () => void
}

/** Select-tool press: handle grab, group-aware pick, Shift/Alt add/remove, marquee on empty space. */
export function beginSelectDrag(args: BeginSelectArgs): void {
  const { e, p, idx, doc, selection } = args
  // a grab of a transform-box handle (or its rotate zone) wins over everything else
  if (selection.length > 0) {
    const hit = args.xform.hit(p, args.zoom, args.touch)
    if (hit && args.xform.begin(hit.kind, hit.handle, p)) {
      args.drag.current = { kind: 'xform', pid: e.pointerId, sx: p.x, sy: p.y }
      args.setDragKind('xform')
      return
    }
  }
  // locked or hidden-ancestor objects are not pickable
  const rawObj = idx >= 0 ? (doc.cellObj?.[idx] ?? 0) : 0
  const obj = args.pickable(rawObj) ? rawObj : 0
  if (obj > 0 && e.shiftKey) {
    // Shift adds/toggles the clicked entity — the whole group is the click unit
    const ids = clickSelectionIds(doc, obj)
    if (ids.some((id) => selection.includes(id))) args.removeFromSelection(ids)
    else args.selectElements([...selection, ...ids])
    return
  }
  if (obj > 0) {
    beginObjMoveDrag({
      e,
      p,
      obj,
      doc,
      selection,
      activeLayerId: args.activeLayerId,
      isSquare: args.isSquare,
      clickIds: clickSelectionIds(doc, obj),
      drag: args.drag,
      setDragKind: args.setDragKind,
      selectElements: args.selectElements,
      removeFromSelection: args.removeFromSelection,
      setActiveLayer: args.setActiveLayer,
    })
    return
  }
  // empty space: a plain click clears, Shift/Alt keep the selection and stretch an
  // additive/subtractive rubber band; everything inside becomes selected on release
  if (!e.shiftKey && !e.altKey) args.clearSelection()
  args.drag.current = {
    kind: 'marquee',
    pid: e.pointerId,
    sx: p.x,
    sy: p.y,
    start: [p.x, p.y],
    additive: e.shiftKey,
    subtractive: e.altKey,
  }
  args.setDragKind('marquee')
  // artwork is there but unselectable: canvas-wide styles keep cellObj empty,
  // so a select click would do nothing — surface why instead of staying silent
  if (doc.styleScope === 'global' && idx >= 0 && doc.cells[idx] > 0) args.showScopeHint()
}

/** Select press on an object: Shift toggle, Alt-clone, layer activation and the move snapshot. */
export function beginObjMoveDrag(args: {
  e: { shiftKey: boolean; altKey: boolean; pointerId: number }
  p: DocPoint
  obj: number
  doc: Doc
  selection: number[]
  activeLayerId: number | null
  isSquare: boolean
  clickIds: number[]
  drag: { current: DragState | null }
  setDragKind: (k: DragState['kind'] | null) => void
  selectElements: (ids: number[]) => void
  removeFromSelection: (ids: number[]) => void
  setActiveLayer: (id: number) => void
}): void {
  if (args.e.shiftKey) {
    const ids = args.clickIds
    if (ids.some((id) => args.selection.includes(id))) args.removeFromSelection(ids)
    else args.selectElements([...args.selection, ...ids])
    return
  }
  const already = args.clickIds.every((id) => args.selection.includes(id))
  if (args.e.altKey) {
    // Alt+drag clones the selection and moves the clones (Illustrator option-drag);
    // a plain Alt+click leaves both copies in place — undo reverts it
    useStore.getState().duplicateSelection()
  } else if (!already) {
    args.selectElements(args.clickIds)
  }
  // clicking an object makes its layer the active one
  if (args.doc.layers) {
    const layerId = objLayer(args.doc.layers, args.obj)?.id
    if (layerId != null && layerId !== args.activeLayerId) args.setActiveLayer(layerId)
  }
  const st = useStore.getState()
  const sel = args.e.altKey ? st.selection : already ? args.selection : args.clickIds
  const snapDoc = st.doc
  // snapshot the selected cells so the drag preview knows what moves
  const moved: [number, number, number][] = []
  if (args.isSquare && snapDoc.cellObj) {
    for (let i = 0; i < snapDoc.cellObj.length; i++) {
      const o = snapDoc.cellObj[i]
      if (o > 0 && sel.includes(o) && snapDoc.cells[i] > 0) moved.push([i, snapDoc.cells[i], o])
    }
  }
  args.drag.current = {
    kind: 'move',
    pid: args.e.pointerId,
    sx: args.p.x,
    sy: args.p.y,
    moved,
    dx: 0,
    dy: 0,
  }
  args.setDragKind('move')
}

/** Marquee release: the band resolves into element ids (additive/subtractive per its modifiers). */
export function resolveMarqueeDrag(args: MarqueeResolveArgs): void {
  const rect = marqueeRect({ x: args.start[0], y: args.start[1] }, args.end)
  const hits = objectsInMarquee(args.doc, rect, args.pickable)
  if (args.subtractive) {
    args.removeFromSelection(hits)
    return
  }
  if (args.additive) {
    args.selectElements([...args.selection, ...hits])
    return
  }
  args.selectElements(hits)
  // the band covered painted artwork yet picked nothing: canvas-wide styles keep
  // cellObj empty — surface why instead of failing silently (same as a bare click)
  if (
    hits.length === 0 &&
    args.doc.styleScope === 'global' &&
    rectHasInk(args.doc.cells, args.bw, args.doc.rows * args.doc.sub, args.doc.sub, rect)
  ) {
    args.showScopeHint()
  }
}
