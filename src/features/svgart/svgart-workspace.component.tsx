import { useEffect, useMemo, useState, type ReactElement } from 'react'

import { sceneToSvg, TEMPLATE_IDS, type TemplateId } from '../../engine/svgart/index.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { download, stamp } from '../../shared/lib/file-download.util.ts'
import { Chip } from '../../shared/ui/index.tsx'
import { MobileSheet } from '../../shared/ui/mobile-sheet.component.tsx'
import { Dialog, DialogContent, DialogTitle } from '../../shared/ui/shadcn/dialog.tsx'
import { useStore } from '../../state/editor.store.ts'
import { SvgArtBackgroundPanel } from './svgart-background-panel.component.tsx'
import { SvgArtFillEditor } from './svgart-fill-editor.component.tsx'
import { SvgArtLayersPanel } from './svgart-layers-panel.component.tsx'
import { duplicateLayer, nudgeLayer, removeLayerById, withUniqueIds } from './svgart-ops.util.ts'
import { SvgArtShapePanel } from './svgart-shape-panel.component.tsx'
import { SvgArtStage } from './svgart-stage.component.tsx'

/**
 * The SVG-studio workspace: the stage (live serialized SVG with canvas handles) in the center, the
 * layer/fill/shape panels in the right column (desktop) or a slide-over sheet (mobile), and the
 * export actions in its own toolbar — the gradient workspace pattern, no worker needed.
 */
export function SvgArtWorkspace(): ReactElement {
  const { t } = useI18n()
  const scene = useStore((s) => s.svgartScene)
  const applyTemplate = useStore((s) => s.applySvgArtTemplate)
  const [panelOpen, setPanelOpen] = useState(false)
  const [codeOpen, setCodeOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const svg = useMemo(() => sceneToSvg(scene), [scene])
  const kb = Math.max(1, Math.round(new Blob([svg]).size / 1024))
  useStudioHotkeys()

  const exportSvg = (): void => {
    download(new Blob([svg], { type: 'image/svg+xml' }), `svgart-${stamp()}.svg`)
  }
  const copySvg = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(svg)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-line flex h-10 shrink-0 items-center gap-2 overflow-x-auto border-b px-2 max-lg:h-14">
          <Chip
            className="shrink-0 max-lg:min-h-11 max-lg:text-sm"
            onClick={() => setTemplateOpen(true)}
            title={t('svgart.template.desc')}
          >
            {t('svgart.template')}
          </Chip>
          <span className="text-muted text-overline hidden shrink-0 md:inline">
            {scene.layers.length} · {kb} KB
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Chip
              className="shrink-0 max-lg:min-h-11 max-lg:text-sm"
              onClick={() => setCodeOpen(true)}
            >
              {t('svgart.code')}
            </Chip>
            <Chip
              className="shrink-0 max-lg:min-h-11 max-lg:text-sm"
              onClick={exportSvg}
              title={t('svgart.exportSvg.desc')}
            >
              {t('svgart.exportSvg')}
            </Chip>
            <Chip
              className="shrink-0 max-lg:min-h-11 max-lg:text-sm"
              onClick={() => void copySvg()}
            >
              {copied ? t('svgart.copied') : t('svgart.copySvg')}
            </Chip>
          </div>
        </div>
        <SvgArtStage />
        <MobileParamsBar onOpen={() => setPanelOpen(true)} />
      </div>

      <aside className="border-line bg-panel hidden w-64 shrink-0 flex-col overflow-y-auto border-l lg:flex">
        <SvgArtLayersPanel />
        <SvgArtShapePanel />
        <SvgArtFillEditor />
        <SvgArtBackgroundPanel />
      </aside>

      {panelOpen && (
        <MobileSheet title={t('svgart.params')} onClose={() => setPanelOpen(false)}>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SvgArtLayersPanel />
            <SvgArtShapePanel />
            <SvgArtFillEditor />
            <SvgArtBackgroundPanel />
          </div>
        </MobileSheet>
      )}

      {templateOpen && (
        <TemplateDialog
          onPick={(id) => {
            applyTemplate(id)
            setTemplateOpen(false)
          }}
          onClose={() => setTemplateOpen(false)}
        />
      )}

      {codeOpen && <CodeDialog svg={svg} onClose={() => setCodeOpen(false)} />}
    </div>
  )
}

/**
 * Studio keyboard shortcuts, active while the studio workspace is mounted: arrows nudge the
 * selected layer (Shift = ×10), Delete removes it, Cmd/Ctrl+D duplicates, Escape deselects. Inputs
 * and open dialogs are excluded (the global editor convention).
 */
function useStudioHotkeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable)
          return
        if (target.closest('[role="dialog"]')) return
      }
      const s = useStore.getState()
      if (s.boundEntry?.kind !== 'svgart') return
      const id = s.svgartSelection.layerId
      const step = e.shiftKey ? 10 : 1
      const nudges: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      }
      const nudge = nudges[e.key]
      if (nudge !== undefined && id !== null) {
        e.preventDefault()
        const [dx, dy] = nudge
        s.updateSvgArtScene((scene) => nudgeLayer(scene, id, dx, dy))
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && id !== null) {
        e.preventDefault()
        s.updateSvgArtScene((scene) => removeLayerById(scene, id))
        s.selectSvgArtLayer(null)
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd' && id !== null) {
        e.preventDefault()
        const { scene: next, newId } = duplicateLayer(s.svgartScene, id)
        s.updateSvgArtScene(() => withUniqueIds(next))
        s.selectSvgArtLayer(newId, 0)
        return
      }
      if (e.key === 'Escape') s.selectSvgArtLayer(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Template re-apply: replaces the whole scene, so the dialog warns before the four buttons. */
function TemplateDialog({
  onPick,
  onClose,
}: {
  onPick: (id: TemplateId) => void
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent showCloseButton={false} className="gap-3 p-4 lg:max-w-md lg:rounded-xl">
        <div className="flex items-center justify-between">
          <DialogTitle className="text-body text-sm font-semibold tracking-wide">
            {t('svgart.template.title')}
          </DialogTitle>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('dialog.close')}
            className="text-muted hover:bg-chip-active hover:text-body rounded-md px-2 py-1 text-xs transition max-lg:h-11 max-lg:w-11 max-lg:text-base"
          >
            ✕
          </button>
        </div>
        <p className="text-muted text-overline">{t('svgart.template.confirm.msg')}</p>
        <div className="grid grid-cols-2 gap-2">
          {TEMPLATE_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onPick(id)}
              className="border-line bg-chip text-body hover:border-accent-line flex min-h-11 items-center justify-center rounded-md border px-2 py-1.5 text-xs transition"
            >
              {t(`svgart.template.${id}` as 'svgart.template.star')}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Toolbar (mobile): opens the panel sheet. */
function MobileParamsBar({ onOpen }: { onOpen: () => void }): ReactElement {
  const { t } = useI18n()
  return (
    <div className="border-line bg-app flex h-14 shrink-0 items-center border-t px-2 lg:hidden">
      <Chip className="h-11 w-full gap-2" onClick={onOpen}>
        {t('svgart.params')}
      </Chip>
    </div>
  )
}

/** The serialized SVG source with copy/download — what you see is exactly what exports. */
function CodeDialog({ svg, onClose }: { svg: string; onClose: () => void }): ReactElement {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(svg)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent showCloseButton={false} className="gap-3 p-4 lg:max-w-2xl">
        <div className="flex items-center justify-between">
          <DialogTitle className="text-body text-sm font-semibold tracking-wide">
            {t('svgart.code.title')}
          </DialogTitle>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('dialog.close')}
            className="text-muted hover:bg-chip-active hover:text-body rounded-md px-2 py-1 text-xs transition max-lg:h-11 max-lg:w-11 max-lg:text-base"
          >
            ✕
          </button>
        </div>
        <pre className="border-line bg-chip text-body text-label max-h-[50dvh] overflow-auto rounded-md border p-2 leading-snug">
          {svg}
        </pre>
        <div className="flex items-center justify-end gap-2">
          <Chip onClick={() => void copy()}>
            {copied ? t('svgart.copied') : t('svgart.copySvg')}
          </Chip>
          <Chip
            onClick={() =>
              download(new Blob([svg], { type: 'image/svg+xml' }), `svgart-${stamp()}.svg`)
            }
          >
            {t('svgart.exportSvg')}
          </Chip>
        </div>
      </DialogContent>
    </Dialog>
  )
}
