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

/** Select press on an object: Shift toggle, Alt-clone, layer activation and the move snapshot. */
export function beginObjMoveDrag(args: {
  e: { shiftKey: boolean; altKey: boolean }
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
  args.drag.current = { kind: 'move', sx: args.p.x, sy: args.p.y, moved, dx: 0, dy: 0 }
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
