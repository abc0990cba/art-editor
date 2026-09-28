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

/** Thumbnail area: stored PNG for pixel projects, live SVG for trace ones. */
function Thumb({ entry }: { entry: ProjectEntry }): ReactElement {
  const svgUrl = useSvgUrl(entry.kind === 'pixel' ? null : entry.svg)
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
        className="text-body hover:bg-chip-active flex min-w-0 flex-1 items-center truncate rounded px-0.5 text-left text-xs font-medium transition max-lg:min-h-11 max-lg:text-sm"
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
  const kindLabel =
    entry.kind === 'pixel'
      ? t('project.kind.pixel')
      : entry.kind === 'gradient'
        ? t('project.kind.gradient')
        : t('project.kind.vector')

  return (
    <div className="bg-panel border-line hover:border-chip-line flex flex-col overflow-hidden rounded-lg border transition">
      <Tooltip label={t('projects.open')}>
        <button type="button" onClick={onOpen} className="block w-full cursor-pointer">
          <Thumb entry={entry} />
        </button>
      </Tooltip>
      <div className="flex flex-col gap-1.5 p-2 max-lg:gap-2 max-lg:p-3">
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
        <div className="text-label flex gap-1 max-lg:gap-2">
          <Tooltip label={t('projects.open')}>
            <button
              type="button"
              onClick={onOpen}
              className="border-line hover:border-chip-line flex flex-1 items-center justify-center gap-1 rounded border py-0.5 transition max-lg:min-h-11 max-lg:text-sm"
            >
              <ActionIcon path="M4.5 11.5L11.5 4.5M6 4.5h5.5V10" />
              {t('projects.open')}
            </button>
          </Tooltip>
          <Tooltip label={t('projects.duplicate')}>
            <button
              type="button"
              onClick={onDuplicate}
              className="border-line hover:border-chip-line flex flex-1 items-center justify-center gap-1 rounded border py-0.5 transition max-lg:min-h-11 max-lg:text-sm"
            >
              <ActionIcon path="M5.5 5.5h7v7h-7zM10.5 5.5v-2h-7v7h2" />
              {t('projects.duplicate')}
            </button>
          </Tooltip>
          <Tooltip label={t('projects.delete')}>
            <button
              type="button"
              onClick={onDelete}
              className="border-line flex flex-1 items-center justify-center gap-1 rounded border py-0.5 transition hover:border-red-500/60 hover:text-red-400 max-lg:min-h-11 max-lg:text-sm"
            >
              <ActionIcon path="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8h5.8l.6-8M6.7 6.5v4M9.3 6.5v4" />
              {t('projects.delete')}
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}

/** Tiny stroke icon for a card action row (16-box, currentColor). */
function ActionIcon({ path }: { path: string }): ReactElement {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={path} />
    </svg>
  )
}
