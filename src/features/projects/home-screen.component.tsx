import { useCallback, useEffect, useState, type ReactElement } from 'react'

import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { ConfirmDialog } from '../../shared/ui/confirm-dialog.component.tsx'
import { Button } from '../../shared/ui/shadcn/button.tsx'
import {
  deleteProject,
  duplicateName,
  lastOpenedProjectId,
  listProjects,
  loadProject,
  newProjectId,
  normalizeName,
  saveProject,
  sortEntries,
  type ProjectEntry,
} from '../../storage/projects.ts'
import { NewProjectDialog } from './new-project-dialog.component.tsx'
import { ProjectCard } from './project-card.component.tsx'

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; entries: ProjectEntry[] }

/**
 * The home screen (`/`): the app's start surface. A Continue card for the last opened project, the
 * library grid with typed cards, and the creation flow (pixel or vector). Only its own buttons
 * navigate — the home screen has no backdrop to dismiss (startup-catalog convention).
 */
export function HomeScreen({ onOpen }: { onOpen: (id: string) => void }): ReactElement {
  const { t } = useI18n()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const entries = state.kind === 'ready' ? state.entries : []
  const continueId = lastOpenedProjectId()
  const continueEntry = entries.find((e) => e.id === continueId) ?? null

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
    const trimmed = value.trim()
    const entry = await loadProject(id)
    if (entry && trimmed && entry.name !== trimmed) {
      await saveProject({ ...entry, name: normalizeName(trimmed), updatedAt: Date.now() })
    }
    setRenaming(null)
    await refresh()
  }

  const deleteEntry = async (id: string) => {
    await deleteProject(id)
    setDeleting(null)
    await refresh()
  }

  return (
    <div className="bg-app text-body flex min-h-dvh flex-col">
      <header className="border-line flex h-14 shrink-0 items-center gap-2 border-b px-2 lg:h-12 lg:px-3">
        <HomeLogo />
        <span className="text-sm font-semibold tracking-wide">{t('app.title')}</span>
        <span className="text-muted ml-2 hidden text-xs sm:inline">{t('home.title')}</span>
        <div className="ml-auto">
          <Button
            type="button"
            onClick={() => setCreating(true)}
            className="h-7 px-3 text-xs max-lg:h-11"
          >
            + {t('home.new')}
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4">
        {state.kind === 'loading' && (
          <p className="text-muted p-4 text-center text-xs">{t('projects.loading')}</p>
        )}
        {state.kind === 'error' && (
          <p className="p-4 text-center text-xs text-red-400">{t('projects.error')}</p>
        )}
        {state.kind === 'ready' && continueEntry && (
          <ContinueCard entry={continueEntry} onOpen={onOpen} />
        )}
        {state.kind === 'ready' && entries.length > 0 && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {sortEntries(entries).map((entry) => (
              <ProjectCard
                key={entry.id}
                entry={entry}
                renaming={renaming?.id === entry.id}
                renameValue={renaming?.value ?? ''}
                onOpen={() => onOpen(entry.id)}
                onRenameStart={() => setRenaming({ id: entry.id, value: entry.name })}
                onRenameChange={(value) =>
                  setRenaming((r) => (r && r.id === entry.id ? { ...r, value } : r))
                }
                onRenameDone={(commit) => {
                  if (commit && renaming) void renameEntry(renaming.id, renaming.value)
                  else setRenaming(null)
                }}
                onDuplicate={() => void duplicateEntry(entry)}
                onDelete={() => setDeleting(entry.id)}
              />
            ))}
          </div>
        )}
        {state.kind === 'ready' && entries.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
            <p className="text-muted text-sm">{t('projects.empty')}</p>
            <Button
              type="button"
              onClick={() => setCreating(true)}
              className="h-auto px-4 py-2 text-xs max-lg:min-h-11"
            >
              + {t('home.new')}
            </Button>
          </div>
        )}
      </main>

      {creating && (
        <NewProjectDialog
          onClose={() => setCreating(false)}
          onCreated={async (id) => {
            setCreating(false)
            await refresh()
            onOpen(id)
          }}
        />
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
    </div>
  )
}

/** The last opened project as a full-width Continue row above the grid. */
function ContinueCard({
  entry,
  onOpen,
}: {
  entry: ProjectEntry
  onOpen: (id: string) => void
}): ReactElement {
  const { t } = useI18n()
  return (
    <section>
      <p className="text-muted text-overline mb-1.5 font-semibold tracking-widest uppercase">
        {t('home.lastOpened')}
      </p>
      <button
        type="button"
        onClick={() => onOpen(entry.id)}
        className="border-accent-line bg-panel hover:border-accent-text flex w-full items-center gap-3 rounded-lg border p-2 text-left transition"
      >
        <span className="min-w-0 flex-1">
          <span className="text-body block truncate text-sm font-medium">{entry.name}</span>
          <span className="text-muted text-overline block">{t('home.lastSaved')}</span>
        </span>
        <span className="border-accent-line text-accent-text rounded border px-2 py-1 text-xs">
          {t('home.continue')}
        </span>
      </button>
    </section>
  )
}

/** Pixel-cluster logo (same mark as the top bars). */
function HomeLogo(): ReactElement {
  return (
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
  )
}
