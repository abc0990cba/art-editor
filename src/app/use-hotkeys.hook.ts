import { useEffect } from 'react'

import { shiftTarget } from '../engine/scene.ts'
import { useStore, undo, redo, type Tool } from '../state/editor.store.ts'

const toolKeys: Record<string, Tool> = {
  v: 'select',
  b: 'pencil',
  e: 'eraser',
  g: 'fill',
  i: 'picker',
  l: 'line',
  r: 'rect',
  o: 'ellipse',
  c: 'connector',
  s: 'star',
  n: 'polygon',
  d: 'diamond',
  h: 'heart',
  q: 'spiral',
  a: 'arrow',
  k: 'lightning',
  m: 'moon',
  w: 'wave',
  x: 'cross',
  j: 'flower',
  u: 'gear',
  z: 'zigzag',
  t: 'ring',
  y: 'arc',
  p: 'drop',
  '1': 'chevron',
  '2': 'concentric',
  '3': 'concentricRect',
  '4': 'sun',
  '5': 'bento',
}

/** Arrows nudge the selection by one cell, Shift+arrows by ten (Illustrator practice). */
function nudgeSelection(key: string, shift: boolean): boolean {
  const s = useStore.getState()
  if (s.selection.length === 0) return false
  const step = shift ? 10 : 1
  const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0
  const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0
  s.moveSelection(dx, dy)
  return true
}

export function useHotkeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable)
      ) {
        return
      }
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && key === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if (mod && key === 'a') {
        e.preventDefault()
        useStore.getState().selectAllElements()
        return
      }
      if (mod && key === 'g') {
        e.preventDefault()
        if (e.shiftKey) useStore.getState().ungroupSelection()
        else useStore.getState().groupSelection()
        return
      }
      if (mod && key === 's') {
        e.preventDefault()
        // saving is ambient now; Ctrl+S forces an immediate write with a fresh thumbnail
        void useStore.getState().saveToLibrary({ freshThumb: true })
        return
      }
      if (mod && (key === '[' || key === ']')) {
        e.preventDefault()
        // stack order: ] brings the node one slot up, [ sends it down (tree order)
        const s = useStore.getState()
        if (!s.doc.layers) return
        const ids =
          s.selection.length > 0 ? s.selection : s.activeLayerId == null ? [] : [s.activeLayerId]
        const dir = key === ']' ? 'after' : 'before'
        for (const id of ids) {
          const st = useStore.getState()
          if (!st.doc.layers) break
          const target = shiftTarget(st.doc.layers, id, dir)
          if (target) st.reorderNode(id, target.targetId, target.place)
        }
        return
      }
      if (!mod && (key === 'delete' || key === 'backspace')) {
        const s = useStore.getState()
        if (s.selection.length > 0) {
          e.preventDefault()
          s.deleteSelection()
        }
        return
      }
      if (!mod && key === 'f') {
        e.preventDefault()
        useStore.getState().requestFit()
        return
      }
      if (!mod && key.startsWith('arrow') && nudgeSelection(key, e.shiftKey)) {
        e.preventDefault()
        return
      }
      if (!mod && toolKeys[key]) {
        useStore.getState().setTool(toolKeys[key])
        return
      }
      if (!mod && (key === '[' || key === ']')) {
        e.preventDefault()
        const s = useStore.getState()
        s.patchBrush({ size: s.brush.size + (key === ']' ? 1 : -1) })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
