import { useCallback, useEffect, useRef, useState } from 'react'

import type { ImportBitmap } from '../engine/import-image.ts'
import { shiftTarget } from '../engine/scene.ts'
import { CanvasStage } from '../features/canvas/canvas-stage.component.tsx'
import { ImportDialog } from '../features/import/import-dialog.component.tsx'
import { NodeEditorCanvas } from '../features/nodes-editor/node-editor-canvas.component.tsx'
import { ProjectDialog } from '../features/projects/project-dialog.component.tsx'
import { ProjectsDialog } from '../features/projects/projects-dialog.component.tsx'
import {
  PANEL_SECTIONS,
  SettingsPanel,
} from '../features/settings-panel/settings-panel.component.tsx'
import {
  allOrder,
  ToolIcon,
  ToolRail,
  ToolSettings,
  type SettingsAnchor,
} from '../features/tools/tool-rail.component.tsx'
import { I18nProvider, useI18n } from '../shared/i18n/i18n.provider.tsx'
import { ConfirmDialog } from '../shared/ui/confirm-dialog.component.tsx'
import { IconButton, SectionGlyph } from '../shared/ui/index.tsx'
import { Tooltip } from '../shared/ui/tooltip.component.tsx'
import {
  useCanUndoRedo,
  useStore,
  undo,
  redo,
  type Tool,
  hasAutosave,
} from '../state/editor.store.ts'
import { TopBar } from './app-top-bar.component.tsx'

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
  const { t } = useI18n()
  useHotkeys()
  const loadPresets = useStore((s) => s.loadPresets)
  const loadBrushes = useStore((s) => s.loadBrushes)
  const loadGlyphSets = useStore((s) => s.loadGlyphSets)
  useEffect(() => {
    void loadPresets()
    void loadBrushes()
    void loadGlyphSets()
  }, [loadPresets, loadBrushes, loadGlyphSets])

  const [importBitmap, setImportBitmap] = useState<ImportBitmap | null>(null)
  const openImportFile = useCallback((file: File | Blob) => {
    void decodeImageFile(file)
      .then(setImportBitmap)
      .catch(() => {
        /* not a decodable image — ignore */
      })
  }, [])
  const nodeEditorOpen = useStore((s) => s.nodeEditorOpen)
  const doc = useStore((s) => s.doc)
  const tool = useStore((s) => s.tool)
  // fresh users (no autosave) see the project creation dialog first
  // previously opened app: land on the project catalog, not the canvas (Photoshop home)
  const [homeOpen, setHomeOpen] = useState(() => hasAutosave())
  const [setupOpen, setSetupOpen] = useState(() => !hasAutosave())
  const [newGuard, setNewGuard] = useState(false)
  // phones/tablets: the right panel lives in a slide-over drawer instead of a column
  const [panelOpen, setPanelOpen] = useState(false)
  const panelCollapsed = useStore((s) => s.panelCollapsed)
  const togglePanelCollapsed = useStore((s) => s.togglePanelCollapsed)
  // секция правой панели, которую нужно раскрыть при разворачивании из полосы
  const [panelSection, setPanelSection] = useState<string | null>(null)
  // mobile: the active tool's settings open as a bottom sheet from the strip's gear
  const [mobileSettings, setMobileSettings] = useState<SettingsAnchor | null>(null)
  const { canUndo, canRedo } = useCanUndoRedo()
  const stripRef = useRef<HTMLDivElement>(null)
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
  // keep the active tool visible in the mobile strip while the user scrolls it
  useEffect(() => {
    stripRef.current
      ?.querySelector(`[data-tool="${tool}"]`)
      ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [tool])
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
      if (!file) return
      e.preventDefault()
      openImportFile(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [openImportFile])

  return (
    <div className="bg-app text-body flex h-dvh flex-col overscroll-none select-none">
      <TopBar onImportFile={openImportFile} onTogglePanel={() => setPanelOpen((v) => !v)} />
      <div className="relative flex min-h-0 flex-1">
        <ToolRail />
        <div ref={editorPaneRef} className="relative flex min-w-0 flex-1">
          <CanvasStage onDropFile={openImportFile} />
          {homeOpen && (
            <ProjectsDialog
              variant="home"
              onClose={() => setHomeOpen(false)}
              onNewProject={() => {
                const busy = doc.cells.some((v) => v !== 0) || doc.links.length > 0
                if (busy) setNewGuard(true)
                else {
                  setHomeOpen(false)
                  setSetupOpen(true)
                }
              }}
            />
          )}
          {newGuard && (
            <ConfirmDialog
              title={t('projects.replaceWarnTitle')}
              message={t('projects.replaceWarn')}
              confirmLabel={t('projects.confirm')}
              cancelLabel={t('projects.cancel')}
              onConfirm={() => {
                setNewGuard(false)
                setHomeOpen(false)
                setSetupOpen(true)
              }}
              onClose={() => setNewGuard(false)}
            />
          )}
          {setupOpen && <ProjectDialog mode="create" onClose={() => setSetupOpen(false)} />}
          {nodeEditorOpen && (
            <>
              {nodeEditorMode === 'split' && (
                <div
                  role="separator"
                  aria-orientation="vertical"
                  onPointerDown={startEditorResize}
                  className="bg-line hover:bg-accent-line hidden w-1 shrink-0 cursor-col-resize transition-colors lg:block"
                />
              )}
              <div
                className={
                  nodeEditorMode === 'overlay'
                    ? 'absolute inset-0 z-30'
                    : 'relative z-30 flex min-w-0 items-stretch max-lg:absolute max-lg:inset-0'
                }
                style={
                  nodeEditorMode === 'split'
                    ? { width: `${nodeEditorSplit * 100}%`, maxWidth: undefined }
                    : undefined
                }
              >
                <NodeEditorCanvas onClose={() => useStore.getState().closeNodeEditor()} />
              </div>
            </>
          )}
        </div>
        {panelCollapsed ? (
          <div
            aria-label={t('panel.expand')}
            className="border-line bg-panel hidden w-12 shrink-0 flex-col items-center gap-1 border-l py-2 lg:flex"
          >
            {PANEL_SECTIONS.map((x) => (
              <Tooltip key={x.id} label={t(x.titleKey as 'panel.color')}>
                <button
                  type="button"
                  aria-label={t(x.titleKey as 'panel.color')}
                  onClick={() => {
                    togglePanelCollapsed()
                    setPanelSection(x.id)
                  }}
                  className="text-muted hover:bg-chip-active hover:text-body flex h-10 w-10 items-center justify-center rounded-lg transition"
                >
                  <SectionGlyph icon={x.icon} />
                </button>
              </Tooltip>
            ))}
          </div>
        ) : (
          <div className="border-line bg-panel hidden w-64 shrink-0 flex-col border-l lg:flex">
            <SettingsPanel
              className="flex min-h-0 w-full flex-1 flex-col"
              openSection={panelSection}
            />
            <div className="border-line border-t p-1.5">
              <IconButton
                title={t('panel.collapse')}
                onClick={togglePanelCollapsed}
                className="mx-auto rotate-180"
              >
                <svg
                  viewBox="0 0 16 16"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                >
                  <path d="M6.5 4L3 7.5 6.5 11" />
                  <path d="M3 7.5h6a4 4 0 010 8H6" />
                </svg>
              </IconButton>
            </div>
          </div>
        )}
      </div>
      {/* mobile: tools in the thumb zone — a horizontally scrollable strip under the
          canvas, plus a settings shortcut for the active tool (Photoshop iOS layout) */}
      <div className="border-line bg-app flex h-14 shrink-0 items-center gap-1.5 border-t px-2 lg:hidden">
        <div
          ref={stripRef}
          className="flex min-w-0 flex-1 [scrollbar-width:none] items-center gap-1 overflow-x-auto py-1.5 [&::-webkit-scrollbar]:hidden"
        >
          {allOrder.map((id) => (
            <button
              key={id}
              data-tool={id}
              type="button"
              aria-label={id}
              onClick={() => useStore.getState().setTool(id)}
              onDoubleClick={() => setMobileSettings({ tool: id, x: 0, y: 0 })}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition ${
                tool === id
                  ? 'border-accent-line bg-accent-soft text-accent-text'
                  : 'text-muted hover:bg-chip hover:text-body border-transparent'
              }`}
            >
              <ToolIcon id={id} className="h-5 w-5" />
            </button>
          ))}
        </div>
        <div className="bg-line h-8 w-px shrink-0" />
        <IconButton
          big
          plate
          title={t('tool.settings')}
          onClick={() => setMobileSettings({ tool, x: 0, y: 0 })}
        >
          <svg
            viewBox="0 0 16 16"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          >
            <path d="M3 4.5h6M12 4.5h1M3 11.5h1M7 11.5h6" />
            <circle cx="10.5" cy="4.5" r="1.6" />
            <circle cx="5.5" cy="11.5" r="1.6" />
          </svg>
        </IconButton>
      </div>
      {mobileSettings && (
        <ToolSettings anchor={mobileSettings} onClose={() => setMobileSettings(null)} />
      )}
      {/* mobile: undo/redo floating pair above the strip — thumb reach, Procreate-style */}
      <div className="fixed right-2 bottom-[4.5rem] z-20 flex flex-col gap-2 lg:hidden">
        <Tooltip label={`${t('top.undo')} (Ctrl+Z)`}>
          <button
            type="button"
            onClick={() => undo()}
            disabled={!canUndo}
            aria-label={t('top.undo')}
            className="border-line bg-chip/90 text-body hover:border-chip-line flex h-11 w-11 items-center justify-center rounded-full border shadow-lg backdrop-blur transition disabled:opacity-30"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            >
              <path d="M6.5 4L3 7.5 6.5 11" />
              <path d="M3 7.5h6a4 4 0 010 8H6" />
            </svg>
          </button>
        </Tooltip>
        <Tooltip label={`${t('top.redo')} (Ctrl+Shift+Z)`}>
          <button
            type="button"
            onClick={() => redo()}
            disabled={!canRedo}
            aria-label={t('top.redo')}
            className="border-line bg-chip/90 text-body hover:border-chip-line flex h-11 w-11 items-center justify-center rounded-full border shadow-lg backdrop-blur transition disabled:opacity-30"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            >
              <path d="M9.5 4L13 7.5 9.5 11" />
              <path d="M13 7.5H7a4 4 0 000 8h1" />
            </svg>
          </button>
        </Tooltip>
      </div>

      {panelOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setPanelOpen(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <aside
            className="border-line bg-panel absolute inset-0 flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-line flex items-center justify-between border-b px-4 py-3">
              <span className="text-muted text-sm font-semibold tracking-wider uppercase">
                {t('top.panel')}
              </span>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                aria-label={t('preview.close')}
                className="text-muted hover:bg-chip-active hover:text-body flex h-11 w-11 items-center justify-center rounded-lg transition"
              >
                <svg
                  viewBox="0 0 16 16"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>
            <div className="flex min-h-0 flex-1">
              <SettingsPanel className="flex min-h-0 flex-1 flex-col" />
            </div>
          </aside>
        </div>
      )}
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
