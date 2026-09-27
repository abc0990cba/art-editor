import { type ReactNode } from 'react'

import { ExportPopover } from '../features/export/export-popover.component.tsx'
import { ProjectDialog } from '../features/projects/project-dialog.component.tsx'
import { ProjectsDialog } from '../features/projects/projects-dialog.component.tsx'
import { useI18n } from '../shared/i18n/i18n.provider.tsx'
import { ConfirmDialog } from '../shared/ui/confirm-dialog.component.tsx'
import { IconButton } from '../shared/ui/index.tsx'
import { Tooltip } from '../shared/ui/tooltip.component.tsx'
import { useStore, undo, redo, useCanUndoRedo } from '../state/editor.store.ts'

/** Desktop import pill: labeled plate opening the hidden file input. */
export function ImportPillButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n()
  return (
    <Tooltip label={`${t('import.open.desc')} (Ctrl+V)`}>
      <button
        type="button"
        onClick={onClick}
        className="border-line bg-chip text-body hover:border-chip-line flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs transition"
      >
        <svg
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect x="2" y="2.5" width="12" height="11" rx="1.2" />
          <circle cx="5.7" cy="6.2" r="1.1" />
          <path d="M2.5 11.5l3.5-3.5 2 2 2.5-2.5 3 3" />
        </svg>
        {t('import.button')}
      </button>
    </Tooltip>
  )
}

/** Desktop export pill: labeled plate with an open/active state toggling the export popover. */
export function ExportPillButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { t } = useI18n()
  return (
    <Tooltip label={t('export.open.desc')}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs transition ${
          open
            ? 'border-accent-line bg-accent-soft text-accent-text'
            : 'border-line bg-chip text-body hover:border-chip-line'
        }`}
      >
        <svg
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M8 2v7.5M8 9.5L5.4 6.9M8 9.5l2.6-2.6M2.5 11.5v1.5a1 1 0 001 1h9a1 1 0 001-1v-1.5" />
        </svg>
        {t('export.open')}
      </button>
    </Tooltip>
  )
}

/** Mobile header: logo, undo/redo, save + settings + overflow (below lg only). */
export function MobileHeader({
  onSettings,
  onTogglePanel,
  more,
}: {
  onSettings: () => void
  onTogglePanel?: () => void
  /** Overflow menu element (DropdownMenu trigger + content) rendered as the last header item */
  more?: ReactNode
}) {
  const { t } = useI18n()
  const projectDirty = useStore((s) => s.projectDirty)
  const saveToLibrary = useStore((s) => s.saveToLibrary)
  const { canUndo, canRedo } = useCanUndoRedo()
  return (
    <header className="border-line flex h-14 shrink-0 items-center gap-1.5 border-b px-2">
      <svg viewBox="0 0 20 20" className="h-6 w-6 shrink-0" aria-hidden>
        <defs>
          <linearGradient id="logo-grad-m" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#e879f9" />
          </linearGradient>
        </defs>
        <rect width="20" height="20" rx="5.5" fill="url(#logo-grad-m)" />
        <rect x="3.5" y="3.5" width="5.6" height="5.6" rx="1.7" fill="#fff" opacity=".95" />
        <rect x="10.9" y="3.5" width="5.6" height="5.6" rx="1.7" fill="#fff" opacity=".7" />
        <rect x="3.5" y="10.9" width="5.6" height="5.6" rx="1.7" fill="#fff" opacity=".55" />
        <circle cx="13.7" cy="13.7" r="2.8" fill="#fff" opacity=".85" />
      </svg>
      <IconButton big plate title={t('top.undo')} onClick={undo} disabled={!canUndo}>
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
      </IconButton>
      <IconButton big plate title={t('top.redo')} onClick={redo} disabled={!canRedo}>
        <svg
          viewBox="0 0 16 16"
          className="h-5 w-5 -scale-x-100"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        >
          <path d="M6.5 4L3 7.5 6.5 11" />
          <path d="M3 7.5h6a4 4 0 010 8H6" />
        </svg>
      </IconButton>
      <IconButton
        big
        plate
        title={projectDirty ? `${t('project.save')} (Ctrl+S)` : t('project.saved')}
        disabled={!projectDirty}
        className={projectDirty ? 'text-accent-text' : undefined}
        onClick={() => void saveToLibrary()}
      >
        <svg
          viewBox="0 0 16 16"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        >
          <path d="M2.5 4A1.5 1.5 0 014 2.5h6.4L13.5 5.6V12a1.5 1.5 0 01-1.5 1.5H4A1.5 1.5 0 012.5 12z" />
          <path d="M5.5 2.5V6h5V2.5" />
          <path d="M5.5 13.5V9.5h5v4" />
        </svg>
      </IconButton>
      <IconButton big plate title={t('project.settings')} onClick={onSettings}>
        <svg
          viewBox="0 0 16 16"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        >
          <circle cx="8" cy="8" r="2.2" />
          <path d="M13.2 9.8a5.4 5.4 0 000-3.6l1.5-1a.5.5 0 00-.1-.7l-1.9-1.4a.5.5 0 00-.6 0l-1.6 1a5.6 5.6 0 00-1.6-.9l-.3-1.9a.5.5 0 00-.5-.4h-2.2a.5.5 0 00-.5.4l-.3 1.9a5.6 5.6 0 00-1.6.9l-1.6-1a.5.5 0 00-.6 0L1.4 4.5a.5.5 0 00-.1.7l1.5 1a5.4 5.4 0 000 3.6l-1.5 1a.5.5 0 00.1.7l1.9 1.4a.5.5 0 00.6 0l1.6-1a5.6 5.6 0 001.6.9l.3 1.9a.5.5 0 00.5.4h2.2a.5.5 0 00.5-.4l.3-1.9a5.6 5.6 0 001.6-.9l1.6 1a.5.5 0 00.6 0z" />
        </svg>
      </IconButton>
      <IconButton big plate title={t('top.panel')} onClick={onTogglePanel}>
        <svg
          viewBox="0 0 16 16"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        >
          <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
          <path d="M10.5 2.5v3M10.5 9.5v3" />
        </svg>
      </IconButton>
      {more}
    </header>
  )
}

/** Desktop identity group: project name pill, save (dirty-gated) and settings gear. */
export function TopBarProjectControls({ onSettings }: { onSettings: () => void }) {
  const { t } = useI18n()
  const projectName = useStore((s) => s.projectName)
  const projectDirty = useStore((s) => s.projectDirty)
  const saveToLibrary = useStore((s) => s.saveToLibrary)
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Tooltip label={t('project.name.desc')}>
        <button
          type="button"
          onClick={onSettings}
          className="border-line bg-chip text-body hover:border-chip-line flex h-7 max-w-[168px] items-center truncate rounded-md border px-2 text-xs transition"
        >
          {projectName || t('project.untitled')}
        </button>
      </Tooltip>
      <IconButton
        plate
        title={projectDirty ? `${t('project.save')} (Ctrl+S)` : t('project.saved')}
        disabled={!projectDirty}
        className={projectDirty ? 'text-accent-text' : undefined}
        onClick={() => void saveToLibrary()}
      >
        <svg
          viewBox="0 0 16 16"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        >
          <path d="M2.5 4A1.5 1.5 0 014 2.5h6.4L13.5 5.6V12a1.5 1.5 0 01-1.5 1.5H4A1.5 1.5 0 012.5 12z" />
          <path d="M5.5 2.5V6h5V2.5" />
          <path d="M5.5 13.5V9.5h5v4" />
        </svg>
      </IconButton>
      <Tooltip label={t('project.settings')}>
        <IconButton plate title={t('project.settings')} onClick={onSettings}>
          <svg
            viewBox="0 0 16 16"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          >
            <circle cx="8" cy="8" r="2.2" />
            <path d="M13.2 9.8a5.4 5.4 0 000-3.6l1.5-1a.5.5 0 00-.1-.7l-1.9-1.4a.5.5 0 00-.6 0l-1.6 1a5.6 5.6 0 00-1.6-.9l-.3-1.9a.5.5 0 00-.5-.4h-2.2a.5.5 0 00-.5.4l-.3 1.9a5.6 5.6 0 00-1.6.9l-1.6-1a.5.5 0 00-.6 0L1.4 4.5a.5.5 0 00-.1.7l1.5 1a5.4 5.4 0 000 3.6l-1.5 1a.5.5 0 00.1.7l1.9 1.4a.5.5 0 00.6 0l1.6-1a5.6 5.6 0 001.6.9l.3 1.9a.5.5 0 00.5.4h2.2a.5.5 0 00.5-.4l.3-1.9a5.6 5.6 0 001.6-.9l1.6 1a.5.5 0 00.6 0z" />
          </svg>
        </IconButton>
      </Tooltip>
    </div>
  )
}

/** Desktop document group: projects, node editor, undo/redo, clear canvas. */
export function TopBarDocumentButtons({
  onProjects,
  onClear,
}: {
  onProjects: () => void
  onClear: () => void
}) {
  const { t } = useI18n()
  const nodeEditorOpen = useStore((s) => s.nodeEditorOpen)
  const openNodeEditor = useStore((s) => s.openNodeEditor)
  const closeNodeEditor = useStore((s) => s.closeNodeEditor)
  const { canUndo, canRedo } = useCanUndoRedo()
  return (
    <div className="flex shrink-0 items-center gap-1">
      <IconButton plate title={t('projects.title')} onClick={onProjects}>
        <svg
          viewBox="0 0 16 16"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        >
          <path d="M1.5 4.5a1 1 0 011-1h3l1.5 1.5h6a1 1 0 011 1v6a1 1 0 01-1 1h-10a1 1 0 01-1-1v-7.5z" />
        </svg>
      </IconButton>
      <IconButton
        plate
        title={t('editor.open')}
        onClick={() => (nodeEditorOpen ? closeNodeEditor() : openNodeEditor())}
      >
        <svg
          viewBox="0 0 16 16"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        >
          <circle cx="3.4" cy="3.4" r="1.7" />
          <circle cx="11.6" cy="7" r="1.7" />
          <circle cx="4.6" cy="11.4" r="1.7" />
          <path d="M4.8 4.4l5 1.9M10.2 8.4L6 10.7" />
        </svg>
      </IconButton>
      <IconButton plate title={`${t('top.undo')} (Ctrl+Z)`} onClick={undo} disabled={!canUndo}>
        <svg
          viewBox="0 0 16 16"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        >
          <path d="M6.5 4L3 7.5 6.5 11" />
          <path d="M3 7.5h6a4 4 0 010 8H6" />
        </svg>
      </IconButton>
      <IconButton
        plate
        title={`${t('top.redo')} (Ctrl+Shift+Z)`}
        onClick={redo}
        disabled={!canRedo}
      >
        <svg
          viewBox="0 0 16 16"
          className="h-4 w-4 -scale-x-100"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        >
          <path d="M6.5 4L3 7.5 6.5 11" />
          <path d="M3 7.5h6a4 4 0 010 8H6" />
        </svg>
      </IconButton>
      <IconButton
        plate
        title={`${t('export.clear')} — ${t('export.clear.desc')}`}
        onClick={onClear}
      >
        <svg
          viewBox="0 0 16 16"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        >
          <path d="M3 4.5h10M6.5 4.5v-1a1 1 0 011-1h1a1 1 0 011 1v1M5 4.5l.6 8a1 1 0 001 .9h2.8a1 1 0 001-.9l.6-8" />
        </svg>
      </IconButton>
    </div>
  )
}

/** The dialog stack shared by the mobile and desktop bar compositions. */
export function TopBarDialogs({
  projectsOpen,
  setupOpen,
  exportOpen,
  clearConfirm,
  onVectorize,
  onCloseProjects,
  onCloseSetup,
  onCloseExport,
  onCloseClearConfirm,
  onClear,
}: {
  projectsOpen: boolean
  setupOpen: boolean
  exportOpen: boolean
  clearConfirm: boolean
  onVectorize: () => void
  onCloseProjects: () => void
  onCloseSetup: () => void
  onCloseExport: () => void
  onCloseClearConfirm: () => void
  onClear: () => void
}) {
  const { t } = useI18n()
  return (
    <>
      {projectsOpen && <ProjectsDialog onClose={onCloseProjects} />}
      {setupOpen && <ProjectDialog mode="edit" onClose={onCloseSetup} />}
      {exportOpen && <ExportPopover onClose={onCloseExport} onVectorize={onVectorize} />}
      {clearConfirm && (
        <ConfirmDialog
          title={t('confirm.clear.title')}
          message={t('confirm.clear.msg')}
          confirmLabel={t('confirm.clear')}
          cancelLabel={t('projects.cancel')}
          onConfirm={onClear}
          onClose={onCloseClearConfirm}
        />
      )}
    </>
  )
}
