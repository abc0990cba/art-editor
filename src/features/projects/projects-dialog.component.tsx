import { useCallback, useEffect, useMemo, useState } from 'react'

import { renderThumbnailDataURL } from '../../engine/png.ts'
import { deserialize } from '../../engine/project.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { ConfirmDialog } from '../../shared/ui/confirm-dialog.component.tsx'
import { Button } from '../../shared/ui/shadcn/button.tsx'
import { Dialog, DialogContent, DialogTitle } from '../../shared/ui/shadcn/dialog.tsx'
import { Tooltip } from '../../shared/ui/tooltip.component.tsx'
import { useStore } from '../../state/editor.store.ts'
import {
  deleteProject,
  duplicateName,
  listProjects,
  loadProject,
  newProjectId,
  normalizeName,
  saveProject,
  type ProjectEntry,
} from '../../storage/projects.ts'

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; entries: ProjectEntry[] }

export function ProjectsDialog({
  onClose,
  variant = 'modal',
  onNewProject,
}: {
  onClose: () => void
  /** 'home' = full-screen startup catalog (no backdrop close, no save row) */
  variant?: 'modal' | 'home'
  /** Home variant: primary "new project" action handed over to the caller */
  onNewProject?: () => void
}) {
  const { t, lang } = useI18n()
  const doc = useStore((s) => s.doc)
  const projectName = useStore((s) => s.projectName)
  const projectId = useStore((s) => s.projectId)
  const loadDoc = useStore((s) => s.loadDoc)
  const newDoc = useStore((s) => s.newDoc)
  const setCurrentProject = useStore((s) => s.setCurrentProject)
  const setProjectName = useStore((s) => s.setProjectName)
  const saveToLibrary = useStore((s) => s.saveToLibrary)
  const markProjectSaved = useStore((s) => s.markProjectSaved)

  const [state, setState] = useState<State>({ kind: 'loading' })
  const entries = state.kind === 'ready' ? state.entries : []
  // prefilled with the current project's name: saving renames it, like Save As
  const [name, setName] = useState(projectName)
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmReplace, setConfirmReplace] = useState<null | (() => void)>(null)

  const refresh = useCallback(async () => {
    try {
      setState({ kind: 'ready', entries: await listProjects() })
    } catch {
      setState({ kind: 'error' })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const hasContent = doc.cells.some((v) => v !== 0) || doc.links.length > 0
  const thumb = useMemo(() => {
    void doc.cols
    try {
      return renderThumbnailDataURL(doc, 160)
    } catch {
      return null
    }
  }, [doc])

  const replaceGuard = (action: () => void) => {
    if (hasContent) setConfirmReplace(() => action)
    else action()
  }

  // Photoshop-style Save, delegated to the store: with a project open it overwrites that
  // entry (keeping its id), otherwise it creates one and binds the editor to it, so the
  // next Save overwrites again. The dialog's input feeds the top-bar name first.
  const saveCurrent = async () => {
    setProjectName(name)
    await saveToLibrary()
    setName(normalizeName(name))
    await refresh()
  }

  const openEntry = (entry: ProjectEntry) => {
    replaceGuard(() => {
      loadDoc(deserialize(entry.doc))
      // the top-bar name now mirrors the opened project
      setCurrentProject(entry.id, entry.name)
      markProjectSaved()
      onClose()
    })
  }

  const newProject = () => {
    replaceGuard(() => {
      newDoc()
      // a name typed into the input names the new project; the untouched current name
      // does not carry over — a new project starts unnamed, like Untitled-1 in Photoshop
      const typed = name.trim()
      setCurrentProject(null, typed && typed !== projectName.trim() ? typed : '')
      onClose()
    })
  }

  const duplicateEntry = async (entry: ProjectEntry) => {
    const copy: ProjectEntry = {
      ...entry,
      id: newProjectId(),
      name: duplicateName(
        entry.name,
        entries.map((e) => e.name),
      ),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await saveProject(copy)
    await refresh()
  }

  const renameEntry = async (id: string, value: string) => {
    const entry = await loadProject(id)
    if (entry) {
      await saveProject({ ...entry, name: normalizeName(value), updatedAt: Date.now() })
    }
    setRenaming(null)
    await refresh()
  }

  const deleteEntry = async (id: string) => {
    await deleteProject(id)
    // deleting the open project leaves the work in the editor as unsaved
    if (id === projectId) setCurrentProject(null, projectName)
    setDeleting(null)
    await refresh()
  }

  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })

  // the open project's card mirrors the live top-bar name, so the list never shows a
  // stale title after renaming (the debounced library write lags behind the input)
  const entryName = (entry: ProjectEntry) =>
    entry.id === projectId && projectName.trim() ? projectName : entry.name

  const shell = 'bg-app fixed inset-0 z-50 flex flex-col overflow-y-auto p-5'
  const card =
    'border-line bg-app mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-4 overflow-hidden rounded-xl border p-4'

  const content = (
    <>
      {variant === 'home' && (
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 20 20" className="h-6 w-6 shrink-0" aria-hidden>
            <defs>
              <linearGradient id="home-logo" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#e879f9" />
              </linearGradient>
            </defs>
            <rect width="20" height="20" rx="5.5" fill="url(#home-logo)" />
            <rect x="3.5" y="3.5" width="5.6" height="5.6" rx="1.7" fill="#fff" opacity=".95" />
            <rect x="10.9" y="3.5" width="5.6" height="5.6" rx="1.7" fill="#fff" opacity=".7" />
            <rect x="3.5" y="10.9" width="5.6" height="5.6" rx="1.7" fill="#fff" opacity=".55" />
            <circle cx="13.7" cy="13.7" r="2.8" fill="#fff" opacity=".85" />
          </svg>
          <h2 className="text-body text-base font-semibold tracking-wide">{t('home.title')}</h2>
        </div>
      )}

      {variant === 'home' && (
        <Button
          type="button"
          onClick={() => (onNewProject ? onNewProject() : newProject())}
          className="h-auto px-4 py-2 text-xs"
        >
          + {t('home.new')}
        </Button>
      )}

      {variant === 'home' && hasContent && (
        <div>
          <p className="text-muted text-overline mb-1.5 font-semibold tracking-widest uppercase">
            {t('home.lastOpened')}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="border-accent-line bg-panel hover:border-accent-text flex w-full items-center gap-3 rounded-lg border p-2 text-left transition"
          >
            {thumb ? (
              <img
                src={thumb}
                alt=""
                className="border-line h-16 w-20 rounded border object-contain"
              />
            ) : (
              <div className="border-line bg-chip h-16 w-20 rounded border" />
            )}
            <span className="min-w-0 flex-1">
              <span className="text-body block truncate text-sm font-medium">
                {projectName.trim() || t('project.untitled')}
              </span>
              <span className="text-muted text-overline block">{t('home.lastSaved')}</span>
            </span>
            <span className="border-accent-line text-accent-text rounded border px-2 py-1 text-xs">
              {t('home.continue')}
            </span>
          </button>
        </div>
      )}

      {variant === 'modal' && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={name}
            placeholder={t('projects.savePlaceholder')}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveCurrent()
            }}
            className="border-line bg-chip text-body focus:border-accent-line flex-1 rounded-md border px-2 py-1.5 text-xs outline-none"
          />
          <Button
            type="button"
            onClick={() => void saveCurrent()}
            className="h-auto px-3 py-1.5 text-xs"
          >
            {t('projects.save')}
          </Button>
          <button
            type="button"
            onClick={newProject}
            className="border-line bg-chip text-body hover:border-chip-line rounded-md border px-3 py-1.5 text-xs transition"
          >
            {t('projects.new')}
          </button>
        </div>
      )}

      {deleting && (
        <ConfirmDialog
          title={t('confirm.deleteProject.title')}
          message={t('confirm.deleteProject.msg')}
          confirmLabel={t('confirm.deleteProject')}
          cancelLabel={t('projects.cancel')}
          onConfirm={() => void deleteEntry(deleting)}
          onClose={() => setDeleting(null)}
        />
      )}
      {confirmReplace && (
        <div className="text-body flex items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          <span>{t('projects.replaceWarn')}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirmReplace(null)
              }}
              className="border-line hover:border-chip-line rounded border px-2 py-1 transition"
            >
              {t('projects.cancel')}
            </button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                const action = confirmReplace
                setConfirmReplace(null)
                action()
              }}
              className="h-auto px-2 py-1 text-xs"
            >
              {t('projects.confirm')}
            </Button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {state.kind === 'loading' && (
          <p className="text-muted p-4 text-center text-xs">{t('projects.loading')}</p>
        )}
        {state.kind === 'error' && (
          <p className="p-4 text-center text-xs text-red-400">{t('projects.error')}</p>
        )}
        {state.kind === 'ready' && entries.length === 0 && (
          <p className="text-muted p-4 text-center text-xs">{t('projects.empty')}</p>
        )}
        {state.kind === 'ready' && entries.length > 0 && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className={`bg-panel overflow-hidden rounded-lg border ${
                  entry.id === projectId ? 'border-accent-line' : 'border-line'
                }`}
              >
                <Tooltip label={t('projects.open')}>
                  <button type="button" onClick={() => openEntry(entry)} className="block w-full">
                    {entry.thumbnail ? (
                      <img
                        src={entry.thumbnail}
                        alt=""
                        className="aspect-[4/3] w-full object-contain"
                      />
                    ) : (
                      <div className="bg-chip aspect-[4/3] w-full" />
                    )}
                  </button>
                </Tooltip>
                <div className="flex flex-col gap-1.5 p-2">
                  <div className="flex items-center gap-1.5">
                    {renaming?.id === entry.id ? (
                      <input
                        autoFocus
                        type="text"
                        value={renaming.value}
                        onChange={(e) => setRenaming({ id: entry.id, value: e.target.value })}
                        onBlur={() => void renameEntry(entry.id, renaming.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void renameEntry(entry.id, renaming.value)
                          if (e.key === 'Escape') setRenaming(null)
                        }}
                        className="border-accent-line bg-chip text-body w-full min-w-0 flex-1 rounded border px-1.5 py-0.5 text-xs outline-none"
                      />
                    ) : (
                      <Tooltip label={t('projects.rename')}>
                        <button
                          type="button"
                          onClick={() => setRenaming({ id: entry.id, value: entryName(entry) })}
                          className="text-body hover:bg-chip-active min-w-0 flex-1 truncate rounded px-0.5 text-left text-xs font-medium transition"
                        >
                          {entryName(entry)}
                        </button>
                      </Tooltip>
                    )}
                    {entry.id === projectId && (
                      <span className="border-accent-line text-accent-text text-overline shrink-0 rounded border px-1 py-px">
                        {t('projects.current')}
                      </span>
                    )}
                  </div>
                  <span className="text-muted text-overline">{fmtDate(entry.updatedAt)}</span>
                  <div className="text-label flex gap-1">
                    <Tooltip label={t('projects.open')}>
                      <button
                        type="button"
                        onClick={() => openEntry(entry)}
                        className="border-line hover:border-chip-line flex-1 rounded border py-0.5 transition"
                      >
                        {t('projects.open')}
                      </button>
                    </Tooltip>
                    <Tooltip label={t('projects.duplicate')}>
                      <button
                        type="button"
                        onClick={() => void duplicateEntry(entry)}
                        className="border-line hover:border-chip-line flex-1 rounded border py-0.5 transition"
                      >
                        {t('projects.duplicate')}
                      </button>
                    </Tooltip>
                    <Tooltip label={t('projects.delete')}>
                      <button
                        type="button"
                        onClick={() => setDeleting(entry.id)}
                        className="border-line flex-1 rounded border py-0.5 transition hover:border-red-500/60 hover:text-red-400"
                      >
                        {t('projects.delete')}
                      </button>
                    </Tooltip>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )

  // the modal variant rides the shadcn dialog (Escape, backdrop, focus trap); the home variant
  // stays a full-screen catalog that only its own buttons navigate (design convention).
  if (variant === 'modal') {
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="flex w-full flex-col gap-3 overflow-hidden p-4 lg:max-h-[85vh] lg:max-w-3xl lg:rounded-xl"
        >
          <div className="flex items-center justify-between">
            <DialogTitle className="text-body text-sm font-semibold tracking-wide">
              {t('projects.title')}
            </DialogTitle>
            <Tooltip label={t('dialog.close')}>
              <button
                type="button"
                onClick={onClose}
                className="text-muted hover:bg-chip-active hover:text-body rounded-md px-2 py-1 text-xs transition"
              >
                ✕
              </button>
            </Tooltip>
          </div>
          {content}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <div className={shell}>
      <div className={card}>{content}</div>
    </div>
  )
}
