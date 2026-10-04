import { useState, type ReactElement } from 'react'

import { serialize, type ProjectJSON } from '../../engine/core/project.ts'
import { renderThumbnailDataURL } from '../../engine/output/png.ts'
import { templateScene, type TemplateId } from '../../engine/svgart/index.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { Button } from '../../shared/ui/shadcn/button.tsx'
import { Dialog, DialogContent, DialogTitle } from '../../shared/ui/shadcn/dialog.tsx'
import { useStore } from '../../state/editor.store.ts'
import {
  newGradientEntry,
  newProjectId,
  newSvgArtEntry,
  newVectorEntry,
  normalizeName,
  saveProject,
  type PixelProjectEntry,
} from '../../storage/projects.ts'
import { ProjectDialog } from './project-dialog.component.tsx'

type Kind = 'pixel' | 'vector' | 'gradient' | 'svgart'

/** Snapshot the (already applied) store document into a fresh pixel library entry. */
async function createPixelEntry(onCreated: (id: string) => void | Promise<void>): Promise<void> {
  const s = useStore.getState()
  const doc = serialize(s.doc) as ProjectJSON
  const now = Date.now()
  let thumbnail = ''
  try {
    thumbnail = renderThumbnailDataURL(s.doc)
  } catch {
    /* rendering failed — the card shows the placeholder until the first save */
  }
  const entry: PixelProjectEntry = {
    id: newProjectId(),
    name: normalizeName(s.projectName),
    kind: 'pixel',
    createdAt: now,
    updatedAt: now,
    thumbnail,
    doc,
  }
  await saveProject(entry)
  await onCreated(entry.id)
}

/**
 * Project creation flow of the home screen: first the type (pixel document or vector trace), then
 * the per-kind setup — pixel reuses the full project dialog (name/size/grid), vector only needs a
 * name before opening the import surface. A created project exists as a library entry immediately.
 */
export function NewProjectDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  /** Called with the new entry's id once it exists in the library */
  onCreated: (id: string) => void | Promise<void>
}): ReactElement {
  const { t } = useI18n()
  const [stage, setStage] = useState<'choose' | Kind>('choose')
  const [name, setName] = useState('')
  const [template, setTemplate] = useState<TemplateId>('star')

  if (stage === 'pixel') {
    return (
      <ProjectDialog
        mode="create"
        onClose={onClose}
        onCreated={() => void createPixelEntry(onCreated)}
      />
    )
  }

  const fieldClass =
    'w-full rounded-md border border-line bg-chip px-2 py-1.5 text-xs text-body outline-none focus:border-accent-line max-lg:min-h-11 max-lg:px-3 max-lg:text-base'

  const hint =
    stage === 'gradient'
      ? t('home.gradient.hint')
      : stage === 'svgart'
        ? t('home.svgart.hint')
        : t('home.vector.hint')

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
            {t('project.new')}
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

        {stage === 'choose' ? (
          <div className="flex flex-col gap-2">
            <KindOption
              title={t('project.kind.pixel')}
              desc={t('home.pixel.desc')}
              icon={<PixelIcon />}
              onPick={() => setStage('pixel')}
            />
            <MediaKindOptions onPick={setStage} />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <label className="block">
              <span className="text-muted mb-1 block text-xs max-lg:text-sm">
                {t('project.name')}
              </span>
              <input
                autoFocus
                type="text"
                value={name}
                placeholder={t('project.untitled')}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void createNamedEntry(stage, name, template, onCreated)
                }}
                className={fieldClass}
              />
            </label>
            {stage === 'svgart' && (
              <div>
                <span className="text-muted mb-1 block text-xs max-lg:text-sm">
                  {t('svgart.template')}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {(['blank', 'star', 'sphere', 'cube', 'cylinder', 'aurora'] as const).map(
                    (id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setTemplate(id)}
                        className={`flex min-h-11 items-center justify-center rounded-md border px-2 py-1.5 text-xs transition ${
                          template === id
                            ? 'border-accent-line bg-accent-soft text-accent-text'
                            : 'border-line bg-chip text-body hover:border-chip-line'
                        }`}
                      >
                        {t(`svgart.template.${id}`)}
                      </button>
                    ),
                  )}
                </div>
              </div>
            )}
            <p className="text-muted text-overline">{hint}</p>
            <div className="flex items-center justify-end gap-2 pt-1 max-lg:gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStage('choose')}
                className="text-body border-line bg-chip hover:border-chip-line hover:bg-chip dark:border-line dark:bg-chip dark:text-body dark:hover:bg-chip h-auto px-3 py-1.5 text-xs font-normal max-lg:min-h-11 max-lg:flex-1"
              >
                {t('projects.cancel')}
              </Button>
              <Button
                type="button"
                onClick={() => void createNamedEntry(stage, name, template, onCreated)}
                className="h-auto px-3 py-1.5 text-xs max-lg:min-h-11 max-lg:flex-1"
              >
                {t('project.create')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** A vector project needs only a name — the import surface greets the user inside. */
async function createVectorEntry(
  rawName: string,
  onCreated: (id: string) => void | Promise<void>,
): Promise<void> {
  const entry = newVectorEntry({
    name: normalizeName(rawName),
    source: null,
    sourceName: '',
    params: useStore.getState().vectorParams,
    svg: null,
    stats: null,
  })
  await saveProject(entry)
  await onCreated(entry.id)
}

/** Same minimal flow for a gradient project: name → import surface. */
async function createGradientEntry(
  rawName: string,
  onCreated: (id: string) => void | Promise<void>,
): Promise<void> {
  const entry = newGradientEntry({
    name: normalizeName(rawName),
    source: null,
    sourceName: '',
    params: useStore.getState().gradientParams,
    svg: null,
    stats: null,
  })
  await saveProject(entry)
  await onCreated(entry.id)
}

/** A studio project starts straight from its template scene — no import step. */
async function createSvgArtEntry(
  rawName: string,
  template: TemplateId,
  onCreated: (id: string) => void | Promise<void>,
): Promise<void> {
  const entry = newSvgArtEntry({ name: normalizeName(rawName), scene: templateScene(template) })
  await saveProject(entry)
  await onCreated(entry.id)
}

/** Name-stage submit for all media kinds (pixel goes through the full project dialog). */
function createNamedEntry(
  kind: 'vector' | 'gradient' | 'svgart',
  rawName: string,
  template: TemplateId,
  onCreated: (id: string) => void | Promise<void>,
): Promise<void> {
  if (kind === 'gradient') return createGradientEntry(rawName, onCreated)
  if (kind === 'svgart') return createSvgArtEntry(rawName, template, onCreated)
  return createVectorEntry(rawName, onCreated)
}

/** The pixel kind icon: a 3×3 cell mosaic. */
function PixelIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor" aria-hidden>
      <rect x="3" y="3" width="5" height="5" rx="1" />
      <rect x="10" y="3" width="5" height="5" rx="1" opacity=".6" />
      <rect x="17" y="3" width="4" height="5" rx="1" opacity=".35" />
      <rect x="3" y="10" width="5" height="5" rx="1" opacity=".6" />
      <rect x="10" y="10" width="5" height="5" rx="1" opacity=".9" />
      <rect x="17" y="10" width="4" height="5" rx="1" opacity=".6" />
      <rect x="3" y="17" width="5" height="4" rx="1" opacity=".35" />
      <rect x="10" y="17" width="5" height="4" rx="1" opacity=".6" />
      <rect x="17" y="17" width="4" height="4" rx="1" opacity=".9" />
    </svg>
  )
}

/**
 * The media kinds: trace ones continue with a name and open on an import surface; the studio adds a
 * template picker.
 */
function MediaKindOptions({
  onPick,
}: {
  onPick: (kind: 'vector' | 'gradient' | 'svgart') => void
}): ReactElement {
  const { t } = useI18n()
  return (
    <>
      <KindOption
        title={t('project.kind.vector')}
        desc={t('home.vector.desc')}
        icon={
          <svg
            viewBox="0 0 24 24"
            className="h-8 w-8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden
          >
            <path d="M3 18C7 18 7 6 12 6s5 12 9 12" />
            <rect x="1.5" y="16.5" width="3" height="3" rx="0.8" />
            <rect x="19.5" y="16.5" width="3" height="3" rx="0.8" />
            <circle cx="12" cy="6" r="1.6" />
          </svg>
        }
        onPick={() => onPick('vector')}
      />
      <KindOption
        title={t('project.kind.gradient')}
        desc={t('home.gradient.desc')}
        icon={
          <svg
            viewBox="0 0 24 24"
            className="h-8 w-8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden
          >
            <defs>
              <linearGradient id="kind-grad" x1="3" y1="18" x2="21" y2="6">
                <stop offset="0" stopColor="currentColor" />
                <stop offset="1" stopColor="currentColor" stopOpacity=".35" />
              </linearGradient>
            </defs>
            <rect x="3" y="3" width="18" height="18" rx="3" fill="url(#kind-grad)" stroke="none" />
            <circle cx="7" cy="17" r="1.6" />
            <circle cx="17" cy="7" r="1.6" />
          </svg>
        }
        onPick={() => onPick('gradient')}
      />
      <KindOption
        title={t('project.kind.svgart')}
        desc={t('home.svgart.desc')}
        icon={
          <svg
            viewBox="0 0 24 24"
            className="h-8 w-8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden
          >
            <defs>
              <radialGradient id="kind-radial" cx="0.4" cy="0.35" r="0.75">
                <stop offset="0" stopColor="currentColor" />
                <stop offset="1" stopColor="currentColor" stopOpacity=".3" />
              </radialGradient>
            </defs>
            <path d="M12 2.5l2.6 6.4 6.9.5-5.3 4.4 1.7 6.7L12 16.8l-5.9 3.7 1.7-6.7-5.3-4.4 6.9-.5z" />
            <circle cx="17.5" cy="17.5" r="4" fill="url(#kind-radial)" stroke="none" />
          </svg>
        }
        onPick={() => onPick('svgart')}
      />
    </>
  )
}

/** Type-chooser card: icon + label + description, whole card clickable. */
function KindOption({
  title,
  desc,
  icon,
  onPick,
}: {
  title: string
  desc: string
  icon: ReactElement
  onPick: () => void
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onPick}
      className="border-line bg-panel hover:border-accent-line flex min-h-11 items-center gap-3 rounded-lg border p-3 text-left transition max-lg:min-h-24"
    >
      <span className="text-body shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className="text-body block text-sm font-medium">{title}</span>
        <span className="text-muted block text-xs">{desc}</span>
      </span>
    </button>
  )
}
