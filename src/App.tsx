import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore, undo, redo, type Tool } from './state/store'
import { I18nProvider } from './i18n'
import { TopBar } from './components/TopBar'
import { ToolRail } from './components/ToolRail'
import { SettingsPanel } from './components/SettingsPanel'
import { CanvasStage } from './components/CanvasStage'
import { ImportDialog } from './components/ImportDialog'
import { NodeEditorCanvas } from './components/NodeEditorCanvas'
import { ProjectDialog } from './components/ProjectDialog'
import { hasAutosave } from './state/store'
import { shiftTarget } from './engine/scene'
import type { ImportBitmap } from './engine/importImage'

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

function useHotkeys(): void {
  useEffect(() => {
    // the standard editors' guard: warn before closing the tab with unsaved changes
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!useStore.getState().projectDirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])
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
        const s = useStore.getState()
        // a no-op when everything is saved: skip the pointless library write
        if (s.projectDirty) void s.saveToLibrary()
        return
      }
      if (mod && (key === '[' || key === ']')) {
        e.preventDefault()
        // stack order: ] brings the node one slot up, [ sends it down (tree order)
        const s = useStore.getState()
        if (!s.doc.layers) return
        const ids = s.selection.length > 0 ? s.selection : s.activeLayerId != null ? [s.activeLayerId] : []
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

/** Decode an image file into an ImportBitmap, capped so the import pipeline stays fast. */
async function decodeImageFile(file: Blob, maxSide = 2048): Promise<ImportBitmap> {
  let source: ImageBitmap | HTMLImageElement
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    source = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve(img)
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('image decode failed'))
      }
      img.src = url
    })
  }
  const w = source instanceof HTMLImageElement ? source.naturalWidth : source.width
  const h = source instanceof HTMLImageElement ? source.naturalHeight : source.height
  const scale = Math.min(1, maxSide / Math.max(1, Math.max(w, h)))
  const dw = Math.max(1, Math.round(w * scale))
  const dh = Math.max(1, Math.round(h * scale))
  const canvas = document.createElement('canvas')
  canvas.width = dw
  canvas.height = dh
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('no 2d context')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, dw, dh)
  if (source instanceof ImageBitmap) source.close()
  return { width: dw, height: dh, data: ctx.getImageData(0, 0, dw, dh).data }
}

function Editor() {
  useHotkeys()
  const loadPresets = useStore((s) => s.loadPresets)
  const loadBrushes = useStore((s) => s.loadBrushes)
  useEffect(() => {
    void loadPresets()
    void loadBrushes()
  }, [loadPresets, loadBrushes])

  const [importBitmap, setImportBitmap] = useState<ImportBitmap | null>(null)
  const openImportFile = useCallback((file: File | Blob) => {
    void decodeImageFile(file)
      .then(setImportBitmap)
      .catch(() => {
        /* not a decodable image — ignore */
      })
  }, [])
  const nodeEditorOpen = useStore((s) => s.nodeEditorOpen)
  // fresh users (no autosave) see the project creation dialog first
  const [setupOpen, setSetupOpen] = useState(() => !hasAutosave())
  const nodeEditorMode = useStore((s) => s.nodeEditorMode)
  const nodeEditorSplit = useStore((s) => s.nodeEditorSplit)
  const editorPaneRef = useRef<HTMLDivElement>(null)
  // drag the divider between the canvas and the node editor (split mode)
  const startEditorResize = (e: React.PointerEvent) => {
    e.preventDefault()
    const container = editorPaneRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const move = (ev: PointerEvent) => {
      useStore.getState().setNodeEditorSplit((ev.clientX - rect.left) / rect.width)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'))
      if (!file) return
      e.preventDefault()
      openImportFile(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [openImportFile])

  return (
    <div className="flex h-dvh flex-col bg-app text-body select-none">
      <TopBar onImportFile={openImportFile} />
      <div className="relative flex min-h-0 flex-1">
        <ToolRail />
        <div ref={editorPaneRef} className="relative flex min-w-0 flex-1">
          <CanvasStage onDropFile={openImportFile} />
          {setupOpen && (
            <ProjectDialog mode="create" onClose={() => setSetupOpen(false)} />
          )}
          {nodeEditorOpen && (
            <>
              {nodeEditorMode === 'split' && (
                <div
                  role="separator"
                  aria-orientation="vertical"
                  onPointerDown={startEditorResize}
                  className="w-1 shrink-0 cursor-col-resize bg-line transition-colors hover:bg-accent-line"
                />
              )}
              <div
                className={
                  nodeEditorMode === 'overlay'
                    ? 'absolute inset-0 z-30'
                    : 'flex min-w-0 items-stretch'
                }
                style={nodeEditorMode === 'split' ? { width: `${nodeEditorSplit * 100}%` } : undefined}
              >
                <NodeEditorCanvas onClose={() => useStore.getState().closeNodeEditor()} />
              </div>
            </>
          )}
        </div>
        <SettingsPanel />
      </div>
      {importBitmap && (
        <ImportDialog
          bitmap={importBitmap}
          onPickFile={openImportFile}
          onClose={() => setImportBitmap(null)}
        />
      )}
    </div>
  )
}

export default function App() {
  return (
    <I18nProvider>
      <Editor />
    </I18nProvider>
  )
}
