import { useEffect, useState, type ReactElement } from 'react'

import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { Tooltip } from '../../shared/ui/tooltip.component.tsx'
import type { ProjectEntry } from '../../storage/projects.ts'

/**
 * The stored SVG as a temporary blob URL (vector projects render their own thumbnail). The URL is
 * created inside the effect: StrictMode's simulated remount revokes a memoized URL without
 * recreating it, which leaves the thumbnail a broken image in dev.
 */
function useSvgUrl(svg: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!svg) {
      setUrl(null)
      return
    }
    const blobUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    setUrl(blobUrl)
    return () => URL.revokeObjectURL(blobUrl)
  }, [svg])
  return url
}

/** Thumbnail area: stored PNG for pixel projects, live SVG for vector ones. */
function Thumb({ entry }: { entry: ProjectEntry }): ReactElement {
  const svgUrl = useSvgUrl(entry.kind === 'vector' ? entry.svg : null)
  const src = entry.kind === 'pixel' ? entry.thumbnail : svgUrl
  if (src) {
    return <img src={src} alt="" className="aspect-[4/3] w-full object-contain" />
  }
  return <div className="bg-chip aspect-[4/3] w-full" />
}

/** The card's name slot: inline input while renaming, clickable label otherwise. */
function NameSlot({
  entry,
  renameValue,
  renaming,
  onRenameStart,
  onRenameChange,
  onRenameDone,
}: {
  entry: ProjectEntry
  renameValue: string
  renaming: boolean
  onRenameStart: () => void
  onRenameChange: (value: string) => void
  onRenameDone: (commit: boolean) => void
}): ReactElement {
  const { t } = useI18n()
  if (renaming) {
    return (
      <input
        autoFocus
        type="text"
        value={renameValue}
        onChange={(e) => onRenameChange(e.target.value)}
        onBlur={() => onRenameDone(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onRenameDone(true)
          if (e.key === 'Escape') onRenameDone(false)
        }}
        className="border-accent-line bg-chip text-body w-full min-w-0 flex-1 rounded border px-1.5 py-0.5 text-xs outline-none"
      />
    )
  }
  return (
    <Tooltip label={t('projects.rename')}>
      <button
        type="button"
        onClick={onRenameStart}
        className="text-body hover:bg-chip-active flex min-w-0 flex-1 items-center truncate rounded px-0.5 text-left text-xs font-medium transition max-lg:min-h-11"
      >
        {entry.name}
      </button>
    </Tooltip>
  )
}

/**
 * One library card on the home screen: thumbnail, type badge, name (inline rename), meta row and
 * open/duplicate/delete actions — thumbnail + name + meta + actions, per the library-row pattern.
 */
export function ProjectCard({
  entry,
  renaming,
  renameValue,
  onOpen,
  onRenameStart,
  onRenameChange,
  onRenameDone,
  onDuplicate,
  onDelete,
}: {
  entry: ProjectEntry
  renaming: boolean
  renameValue: string
  onOpen: () => void
  onRenameStart: () => void
  onRenameChange: (value: string) => void
  onRenameDone: (commit: boolean) => void
  onDuplicate: () => void
  onDelete: () => void
}): ReactElement {
  const { t, lang } = useI18n()
  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  const kindLabel = entry.kind === 'pixel' ? t('project.kind.pixel') : t('project.kind.vector')

  return (
    <div className="bg-panel border-line hover:border-chip-line flex flex-col overflow-hidden rounded-lg border transition">
      <Tooltip label={t('projects.open')}>
        <button type="button" onClick={onOpen} className="block w-full cursor-pointer">
          <Thumb entry={entry} />
        </button>
      </Tooltip>
      <div className="flex flex-col gap-1.5 p-2">
        <div className="flex items-center gap-1.5">
          <span className="border-line text-muted text-overline shrink-0 rounded border px-1 py-px">
            {kindLabel}
          </span>
          <NameSlot
            entry={entry}
            renameValue={renameValue}
            renaming={renaming}
            onRenameStart={onRenameStart}
            onRenameChange={onRenameChange}
            onRenameDone={onRenameDone}
          />
        </div>
        <span className="text-muted text-overline truncate">
          {fmtDate(entry.updatedAt)}
          {entry.kind === 'pixel' ? ` · ${entry.doc.cols} × ${entry.doc.rows}` : ''}
        </span>
        <div className="text-label flex gap-1">
          <Tooltip label={t('projects.open')}>
            <button
              type="button"
              onClick={onOpen}
              className="border-line hover:border-chip-line flex-1 rounded border py-0.5 transition max-lg:min-h-11"
            >
              {t('projects.open')}
            </button>
          </Tooltip>
          <Tooltip label={t('projects.duplicate')}>
            <button
              type="button"
              onClick={onDuplicate}
              className="border-line hover:border-chip-line flex-1 rounded border py-0.5 transition max-lg:min-h-11"
            >
              {t('projects.duplicate')}
            </button>
          </Tooltip>
          <Tooltip label={t('projects.delete')}>
            <button
              type="button"
              onClick={onDelete}
              className="border-line flex-1 rounded border py-0.5 transition hover:border-red-500/60 hover:text-red-400 max-lg:min-h-11"
            >
              {t('projects.delete')}
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}
