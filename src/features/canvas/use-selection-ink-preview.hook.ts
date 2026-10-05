import { useCallback, useEffect, useRef } from 'react'

import { bufferWidth } from '../../engine/core/doc.ts'
import {
  selectionBox,
  selectionInk,
  type CellBox,
  type InkCell,
} from '../../engine/effects/selection-xform.ts'
import { useStore } from '../../state/editor.store.ts'
import type { TransformStaging } from './use-selection-transform.hook.ts'

/**
 * Shared ink-preview plumbing for the selection parameter popovers: snapshot the selection's ink
 * once on open (the doc/selection pair is stable while a popover lives), then repaint a ghost
 * through the same staging surface the transform drag uses on every parameter tick. Unmount (Apply,
 * Cancel, selection lost) drops the ghost so the committed doc renders again.
 */

/** One snapshot of the selection ink plus its buffer geometry. */
export interface InkSnap {
  src: Map<number, InkCell>
  box: CellBox
  bw: number
  bh: number
}

export function useSelectionInkPreview(staging: TransformStaging) {
  const doc = useStore((s) => s.doc)
  const selection = useStore((s) => s.selection)
  const snapRef = useRef<InkSnap | null>(null)

  // snapshot once on open; repaints close over the ref, so slider ticks skip the buffer scan
  useEffect(() => {
    const src =
      doc.cellObj && selection.length > 0 ? selectionInk(doc.cells, doc.cellObj, selection) : null
    if (!src) {
      snapRef.current = null
      return
    }
    const bw = bufferWidth(doc)
    const bh = doc.rows * doc.sub
    const box = selectionBox(doc.cells, doc.cellObj, selection, bw, bh)
    snapRef.current = box ? { src, box, bw, bh } : null
  }, [doc, selection])

  /** Repaint the ghost with `map` applied to the snapshot. */
  const paintGhost = useCallback(
    (map: (snap: InkSnap) => Map<number, InkCell>) => {
      const st = staging.ensureStaging()
      st.cells.clear()
      st.objs?.clear()
      const snap = snapRef.current
      if (snap) {
        // hide the committed ink first: the ghost carries every visible cell of the preview
        for (const i of snap.src.keys()) {
          st.cells.set(i, null)
          st.objs?.set(i, null)
        }
        for (const [i, cell] of map(snap)) {
          st.cells.set(i, cell.v)
          st.objs?.set(i, cell.o)
        }
      }
      staging.scheduleStaging()
    },
    [staging],
  )

  // unmount (Apply, Cancel, selection lost): drop the ghost, the committed doc renders again
  useEffect(
    () => () => {
      const st = staging.ensureStaging()
      st.cells.clear()
      st.objs?.clear()
      staging.scheduleStaging()
    },
    [staging],
  )

  return paintGhost
}
