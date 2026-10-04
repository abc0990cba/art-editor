import { useCallback, useEffect } from 'react'

import { deleteAnchor, simplifyPath, smoothAll, type CurvePath } from '../../engine/curves/index.ts'
import { useStore } from '../../state/editor.store.ts'
import { buildPenInk, penSourceParams, type PenInkParams } from './pen-ink.util.ts'

/** Everything the actions need from the gesture hook, as getters/callbacks (no shared mutation). */
export interface PenActionsParams {
  /** Fresh hook inputs for the ink build (doc, grid, symmetry, expand…) */
  inkParams: () => PenInkParams
  getGesture: () => { start: CurvePath } | null
  setGesture: (g: null) => void
  /** Drop the staged preview buffer */
  clearStaging: () => void
  scheduleOverlay: () => void
  /** RAF coalescer of the gesture hook (store patch + preview + overlay in one frame) */
  schedule: () => void
  refreshPreview: () => void
}

/**
 * The pen's doc-level actions: the one-undo-step commit (fresh parametric object or in-place
 * replace of a re-edited one), the panel actions (close / smooth / simplify / clear) and the
 * keyboard bindings (Enter commits, Escape cancels, Delete removes the picked anchor).
 */
export function usePenActions(P: PenActionsParams) {
  const {
    schedule,
    refreshPreview,
    inkParams,
    getGesture,
    setGesture,
    clearStaging,
    scheduleOverlay,
  } = P

  const clearDraft = useCallback(() => {
    useStore.getState().endPen()
    setGesture(null)
    clearStaging()
    scheduleOverlay()
  }, [clearStaging, scheduleOverlay, setGesture])

  const deleteSelected = useCallback(() => {
    const s = useStore.getState()
    const D = s.pen
    if (!D || D.selected == null) return
    s.patchPen({ path: deleteAnchor(D.path, D.selected), selected: null })
    schedule()
  }, [schedule])

  /** Enter / panel commit: rasterize the draft into one undoable object on the active layer. */
  const commit = useCallback(() => {
    const p = inkParams()
    const s = useStore.getState()
    const D = s.pen
    if (!D) return
    if (D.path.anchors.length === 0) {
      clearDraft()
      return
    }
    const { cells, resolved } = buildPenInk(p, D.path)
    s.pushRecent(s.color)
    if (D.replaceObjId != null && s.doc.layers) {
      s.commitPenReplace(cells, penSourceParams(D.path))
    } else {
      const parametric =
        p.isSquare && p.symmetry.mode === 'none'
          ? { op: 'source.bezier', params: penSourceParams(D.path) }
          : undefined
      s.paintCellsValues(cells, resolved, parametric)
      // in element scope the fresh curve selects itself, Illustrator-style
      if (resolved.styleScope === 'element') {
        const first = cells.keys().next().value
        const obj = first == null ? 0 : (useStore.getState().doc.cellObj?.[first] ?? 0)
        if (obj > 0) s.selectElements([obj])
      }
    }
    clearDraft()
  }, [clearDraft, inkParams])

  /** Escape: restore the gesture's starting path, or drop the whole draft. */
  const cancel = useCallback(() => {
    const g = getGesture()
    if (g) {
      setGesture(null)
      useStore.getState().patchPen({ path: g.start })
      refreshPreview()
      scheduleOverlay()
      return
    }
    clearDraft()
  }, [clearDraft, getGesture, refreshPreview, scheduleOverlay, setGesture])

  /** Tool switch away: a non-empty draft commits (forgiving default), an empty one drops. */
  const onToolChange = useCallback(() => {
    const D = useStore.getState().pen
    if (D && D.path.anchors.length > 0) commit()
    else clearDraft()
  }, [clearDraft, commit])

  const closePathAct = useCallback(() => {
    const D = useStore.getState().pen
    if (!D || D.path.closed || D.path.anchors.length < 2) return
    useStore.getState().patchPen({ path: { ...D.path, closed: true } })
    P.refreshPreview()
    P.scheduleOverlay()
  }, [P])

  const smoothAllAct = useCallback(() => {
    const D = useStore.getState().pen
    if (!D || D.path.anchors.length < 3) return
    useStore.getState().patchPen({ path: smoothAll(D.path) })
    P.refreshPreview()
    P.scheduleOverlay()
  }, [P])

  const simplifyAct = useCallback(() => {
    const D = useStore.getState().pen
    if (!D || D.path.anchors.length < 3) return
    useStore.getState().patchPen({ path: simplifyPath(D.path) })
    P.refreshPreview()
    P.scheduleOverlay()
  }, [P])

  // keyboard: Enter commits, Escape cancels, Delete/Backspace removes the picked anchor
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState()
      if (s.tool !== 'pen') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'Enter') {
        commit()
        e.preventDefault()
      } else if (e.key === 'Escape') {
        cancel()
        e.preventDefault()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.pen?.selected != null) {
        deleteSelected()
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancel, commit, deleteSelected])

  return {
    commit,
    cancel,
    clearDraft,
    onToolChange,
    closePathAct,
    smoothAllAct,
    simplifyAct,
    deleteSelected,
  }
}
