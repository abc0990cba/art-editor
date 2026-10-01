import { useLoaderData, useNavigate } from '@tanstack/react-router'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'

import type { ImportBitmap } from '../engine/import-image.ts'
import { deserialize } from '../engine/project.ts'
import { GradientWorkspace } from '../features/gradient/gradient-workspace.component.tsx'
import { ImportDialog } from '../features/import/import-dialog.component.tsx'
import { VectorWorkspace } from '../features/vectorizer/vector-workspace.component.tsx'
import { I18nProvider } from '../shared/i18n/i18n.provider.tsx'
import { decodeImageFile } from '../shared/lib/decode-image.util.ts'
import { useStore } from '../state/editor.store.ts'
import type {
  GradientProjectEntry,
  PixelProjectEntry,
  VectorProjectEntry,
} from '../storage/projects.ts'
import { TopBar } from './app-top-bar.component.tsx'
import {
  MobilePanelDrawer,
  MobileToolStrip,
  PixelCanvasArea,
} from './pixel-workspace.component.tsx'
import { useHotkeys } from './use-hotkeys.hook.ts'
import { useVectorizeBridge } from './use-vectorize-bridge.hook.ts'
import { useViewSearchSync } from './view-search.hook.ts'

/**
 * The editor route (`/p/$projectId`): binds the loaded library entry and fills the app with the
 * workspace its kind calls for — the pixel canvas or the vector tracer. Reload restores it from the
 * URL (Figma-style); view state (panels, node editor) rides the search params.
 */
export function ProjectRoute(): ReactElement {
  const entry = useLoaderData({ from: '/p/$projectId' })
  const navigate = useNavigate()
  useHotkeys()
  useViewSearchSync()
  const vectorizeCanvas = useVectorizeBridge()

  const [importBitmap, setImportBitmap] = useState<ImportBitmap | null>(null)
  // phones/tablets: the right panel lives in a slide-over drawer instead of a column
  const [panelOpen, setPanelOpen] = useState(false)

  // imports and pastes route by the open project's kind: pixel opens the dither dialog,
  // the vector and gradient workspaces set their trace source directly
  const openImportFile = useCallback((file: File | Blob) => {
    const name = file instanceof File ? file.name : ''
    void decodeImageFile(file)
      .then((bitmap) => {
        const s = useStore.getState()
        if (s.boundEntry?.kind === 'vector') s.setVectorSource(bitmap, name)
        else if (s.boundEntry?.kind === 'gradient') s.setGradientSource(bitmap, name)
        else setImportBitmap(bitmap)
      })
      .catch(() => {
        /* not a decodable image — ignore */
      })
  }, [])
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

  const openProjectById = useCallback(
    (id: string) => void navigate({ to: '/p/$projectId', params: { projectId: id } }),
    [navigate],
  )

  return (
    <I18nProvider>
      <div className="bg-app text-body flex h-dvh flex-col overscroll-none select-none">
        <TopBar
          kind={entry.kind}
          onImportFile={openImportFile}
          onTogglePanel={() => setPanelOpen((v) => !v)}
          onVectorize={vectorizeCanvas}
          onOpenProject={openProjectById}
        />
        {entry.kind === 'vector' ? (
          <VectorSurface entry={entry} />
        ) : entry.kind === 'gradient' ? (
          <GradientSurface entry={entry} />
        ) : (
          <PixelSurface entry={entry}>
            <MobileToolStrip />
            {panelOpen && <MobilePanelDrawer onClose={() => setPanelOpen(false)} />}
          </PixelSurface>
        )}
        {importBitmap && (
          <ImportDialog
            bitmap={importBitmap}
            onPickFile={openImportFile}
            onClose={() => setImportBitmap(null)}
          />
        )}
      </div>
    </I18nProvider>
  )
}

/** The vector workspace: state restored from the project's trace session, then self-sufficient. */
function VectorSurface({ entry }: { entry: VectorProjectEntry }): ReactElement {
  const loadVectorEntry = useStore((s) => s.loadVectorEntry)
  useLayoutEffect(() => {
    const s = useStore.getState()
    s.openProject(entry)
    loadVectorEntry(entry)
  }, [entry, loadVectorEntry])
  return <VectorWorkspace />
}

/** The gradient workspace: state restored from the project's gradient session, then self-sufficient. */
function GradientSurface({ entry }: { entry: GradientProjectEntry }): ReactElement {
  const loadGradientEntry = useStore((s) => s.loadGradientEntry)
  useLayoutEffect(() => {
    const s = useStore.getState()
    s.openProject(entry)
    loadGradientEntry(entry)
  }, [entry, loadGradientEntry])
  return <GradientWorkspace />
}

/** The pixel surface: canvas area + mobile chrome, bound to the opened entry before first paint. */
function PixelSurface({
  entry,
  children,
}: {
  entry: PixelProjectEntry
  children?: ReactNode
}): ReactElement {
  const loadDoc = useStore((s) => s.loadDoc)
  // bind the entry before first paint so the canvas never flashes the boot document
  useLayoutEffect(() => {
    const s = useStore.getState()
    try {
      s.loadDoc(deserialize(entry.doc))
    } catch {
      s.newDoc() // corrupted entry — a fresh canvas instead of a crash
    }
    s.openProject(entry)
    s.markProjectSaved()
    // opening a project (home screen, switcher, reload) always fits the canvas to the
    // screen — a one-shot automatic zoom at open time, never on later edits
    s.requestFit()
  }, [entry, loadDoc])

  return (
    <>
      <PixelCanvasArea />
      {children}
    </>
  )
}
