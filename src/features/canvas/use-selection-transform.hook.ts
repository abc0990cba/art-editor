import { useCallback, useRef } from 'react'

import { bufferWidth, type Doc, type Link } from '../../engine/doc.ts'
import {
  mapInk,
  xformMatrices,
  type CellBox,
  type InkCell,
  type SelectionXform,
} from '../../engine/selection-xform.ts'
import { useStore } from '../../state/editor.store.ts'
import type { DocPoint } from './canvas-stage.util.ts'
import {
  docBoxOf,
  hitHandle,
  rotateDrag,
  scaleDrag,
  type DocBox,
  type LiveRotate,
  type LiveXform,
  type XformHandle,
} from './selection-transform.util.ts'

/** Staging surface the hook paints the live ghost with (same plumbing the move drag uses). */
export interface TransformStaging {
  ensureStaging: () => {
    cells: Map<number, number | null>
    objs: Map<number, number | null>
    links?: Link[]
  }
  scheduleStaging: () => void
}

interface XformDrag {
  mode: 'scale' | 'rotate'
  handle: XformHandle
  box: DocBox
  angle0: number
  live: LiveXform | LiveRotate | null
  src: Map<number, InkCell>
}

/**
 * The scale/rotate drag state machine of the selection transform box: snapshots the selection's ink
 * on pointerdown, repaints the staged ghost per move (inverse-sampled remap, connectors ride the
 * same affine map) and commits one undoable transformSelection on release. Pure interaction — box
 * geometry in selection-transform.util.ts, cell mapping in engine/selection-xform.ts.
 */
export function useSelectionTransform(
  doc: Doc,
  selection: number[],
  cellBox: CellBox | null,
  sub: number,
  staging: TransformStaging,
) {
  const dragRef = useRef<XformDrag | null>(null)
  const box = cellBox ? docBoxOf(cellBox, sub) : null

  const hit = useCallback(
    (p: DocPoint, zoom: number, touch: boolean) => hitHandle(box, p, zoom, touch),
    [box],
  )

  const begin = useCallback(
    (kind: 'handle' | 'rotate', handle: XformHandle, p: DocPoint): boolean => {
      if (!box || !cellBox || selection.length === 0 || !doc.cellObj) return false
      const sel = new Set(selection)
      const src = new Map<number, InkCell>()
      for (let i = 0; i < doc.cellObj.length; i++) {
        const o = doc.cellObj[i]
        if (o > 0 && sel.has(o) && doc.cells[i] > 0) src.set(i, { v: doc.cells[i], o })
      }
      if (src.size === 0) return false
      const cx = (box.x0 + box.x1) / 2
      const cy = (box.y0 + box.y1) / 2
      dragRef.current = {
        mode: kind === 'rotate' ? 'rotate' : 'scale',
        handle,
        box,
        angle0: Math.atan2(p.y - cy, p.x - cx),
        live: null,
        src,
      }
      return true
    },
    [box, cellBox, doc, selection],
  )

  const update = useCallback(
    (p: DocPoint, e: { shiftKey: boolean }) => {
      const d = dragRef.current
      if (!d) return
      // corners scale uniformly; Shift frees the axes (Illustrator inverted for pixel work)
      d.live =
        d.mode === 'scale'
          ? scaleDrag(d.box, d.handle, p, !e.shiftKey)
          : rotateDrag(d.box, d.angle0, p, e.shiftKey)
      if (!d.live) return
      const xform: SelectionXform =
        d.live.kind === 'scale' ? d.live.x : { kind: 'rotate', angle: d.live.angle }
      const m = xformMatrices(xform, cellBox!)
      const bw = bufferWidth(doc)
      const bh = doc.rows * doc.sub
      const st = staging.ensureStaging()
      st.cells.clear()
      st.objs!.clear()
      // sources erased; remapped copies painted with their values + owners; the selected
      // objects' connectors ride the same affine map, the rest stay put
      const sel = new Set(selection)
      const links: Link[] = []
      for (const l of doc.links) {
        if (!l.obj || !sel.has(l.obj)) {
          links.push(l)
          continue
        }
        const [ax, ay] = m.fwd(l.ax + 0.5, l.ay + 0.5)
        const [bx, by] = m.fwd(l.bx + 0.5, l.by + 0.5)
        links.push({
          ...l,
          ax: Math.floor(ax),
          ay: Math.floor(ay),
          bx: Math.floor(bx),
          by: Math.floor(by),
        })
      }
      st.links = links
      for (const i of d.src.keys()) {
        st.cells.set(i, null)
        st.objs!.set(i, null)
      }
      const mapped = mapInk(d.src, m, cellBox!, bw, bh)
      for (const [i, cell] of mapped) {
        st.cells.set(i, cell.v)
        st.objs!.set(i, cell.o)
      }
      staging.scheduleStaging()
    },
    [staging, cellBox, doc, selection],
  )

  /** Commit the drag as one undoable transform; false when the drag never moved. */
  const finish = useCallback((): boolean => {
    const d = dragRef.current
    dragRef.current = null
    if (!d || !d.live) return false
    const xform: SelectionXform =
      d.live.kind === 'scale' ? d.live.x : { kind: 'rotate', angle: d.live.angle }
    useStore.getState().transformSelection(xform)
    return true
  }, [])

  const cancel = useCallback(() => {
    dragRef.current = null
  }, [])

  return {
    box,
    hit,
    begin,
    update,
    finish,
    cancel,
    live: (): LiveXform | LiveRotate | null => dragRef.current?.live ?? null,
  }
}
