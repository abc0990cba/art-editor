import { useEffect, useRef, useState } from 'react'

import { ExportPopover } from '../features/export/export-popover.component.tsx'
import { ProjectDialog } from '../features/projects/project-dialog.component.tsx'
import { ProjectsDialog } from '../features/projects/projects-dialog.component.tsx'
import { useI18n } from '../shared/i18n/i18n.provider.tsx'
import { IconButton, useMediaQuery } from '../shared/ui/index.tsx'
import { Tooltip } from '../shared/ui/tooltip.component.tsx'
import { useStore, undo, redo, useCanUndoRedo } from '../state/editor.store.ts'

export function TopBar({
  onImportFile,
  onTogglePanel,
}: {
  onImportFile: (file: File) => void
  /** Phones/tablets: toggles the right-panel drawer (the column is hidden below lg) */
  onTogglePanel?: () => void
}) {
  const { t } = useI18n()
  const importFileRef = useRef<HTMLInputElement>(null)
  const doc = useStore((s) => s.doc)
  const projectName = useStore((s) => s.projectName)
  const projectDirty = useStore((s) => s.projectDirty)
  const saveToLibrary = useStore((s) => s.saveToLibrary)
  const nodeEditorOpen = useStore((s) => s.nodeEditorOpen)
  const openNodeEditor = useStore((s) => s.openNodeEditor)
  const closeNodeEditor = useStore((s) => s.closeNodeEditor)
  const clear = useStore((s) => s.clear)
  const lang = useStore((s) => s.lang)
  const setLang = useStore((s) => s.setLang)
  const themePref = useStore((s) => s.themePref)
  const setThemePref = useStore((s) => s.setThemePref)
  const { canUndo, canRedo } = useCanUndoRedo()
  const [projectsOpen, setProjectsOpen] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  // phones/tablets swap the full bar for the mobile composition (nav + overflow menu)
  const isNarrow = useMediaQuery('(max-width: 1023px)')
  const [themeOpen, setThemeOpen] = useState(false)
  useEffect(() => {
    if (!langOpen && !themeOpen && !moreOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLangOpen(false)
        setThemeOpen(false)
        setMoreOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [langOpen, themeOpen, moreOpen])

  if (isNarrow) {
    // mobile: nav + document state only (Photoshop/Procreate pattern) — the tools
    // live in the bottom strip (App), rare actions hide behind the overflow menu
    const themeLabel = { dark: t('theme.dark'), light: t('theme.light'), auto: t('theme.auto') }[
      themePref
    ]
    const row = (label: string, action: () => void) => (
      <button
        type="button"
        onClick={() => {
          setMoreOpen(false)
          action()
        }}
        className="text-body hover:bg-chip-active flex h-11 w-full items-center rounded-lg px-3 text-left text-sm transition"
      >
        {label}
      </button>
    )
    return (
      <>
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
            <rect x="9.2" y="9.2" width="1.6" height="1.6" rx=".55" fill="#fff" opacity=".9" />
          </svg>
          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            aria-label={t('project.name')}
            className="border-line bg-chip text-body hover:border-chip-line flex h-10 min-w-0 flex-1 items-center rounded-md border px-2.5 text-left text-xs transition"
          >
            <span className="truncate">{projectName || t('project.untitled')}</span>
          </button>
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
          <IconButton big plate title={t('top.more')} onClick={() => setMoreOpen((v) => !v)}>
            <svg viewBox="0 0 16 16" className="h-5 w-5" fill="currentColor">
              <circle cx="3.2" cy="8" r="1.4" />
              <circle cx="8" cy="8" r="1.4" />
              <circle cx="12.8" cy="8" r="1.4" />
            </svg>
          </IconButton>
        </header>
        {moreOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
            <div className="border-line bg-raised fixed top-15 right-2 z-50 w-64 rounded-xl border p-1.5 shadow-2xl">
              {row(t('projects.title'), () => setProjectsOpen(true))}
              {row(nodeEditorOpen ? t('editor.close') : t('editor.open'), () =>
                nodeEditorOpen ? closeNodeEditor() : openNodeEditor(),
              )}
              {row(t('import.open'), () => importFileRef.current?.click())}
              {row(t('export.open'), () => setExportOpen(true))}
              {row(t('project.settings'), () => setSetupOpen(true))}
              {row(`${t('top.theme')}: ${themeLabel}`, () =>
                setThemePref(
                  themePref === 'dark' ? 'light' : themePref === 'light' ? 'auto' : 'dark',
                ),
              )}
              {row(`${t('lang.switch')}: ${lang === 'ru' ? 'RU' : 'EN'}`, () =>
                setLang(lang === 'ru' ? 'en' : 'ru'),
              )}
              <div className="bg-line my-1 h-px" />
              {row(t('export.clear'), () => clear())}
            </div>
          </>
        )}
        {projectsOpen && <ProjectsDialog onClose={() => setProjectsOpen(false)} />}
        {setupOpen && <ProjectDialog mode="edit" onClose={() => setSetupOpen(false)} />}
        {exportOpen && <ExportPopover onClose={() => setExportOpen(false)} />}
      </>
    )
  }

  return (
    <header className="border-line flex h-12 shrink-0 items-center gap-3 border-b px-3">
      <div className="flex shrink-0 items-center gap-2">
        {/* pixel-cluster logo: rounded 2×2 pixels with a dither dot in the middle */}
        <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0" aria-hidden>
          <defs>
            <linearGradient id="logo-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#818cf8" />
              <stop offset="100%" stopColor="#e879f9" />
            </linearGradient>
          </defs>
          <rect width="20" height="20" rx="5.5" fill="url(#logo-grad)" />
          <rect x="3.5" y="3.5" width="5.6" height="5.6" rx="1.7" fill="#fff" opacity=".95" />
          <rect x="10.9" y="3.5" width="5.6" height="5.6" rx="1.7" fill="#fff" opacity=".7" />
          <rect x="3.5" y="10.9" width="5.6" height="5.6" rx="1.7" fill="#fff" opacity=".55" />
          <circle cx="13.7" cy="13.7" r="2.8" fill="#fff" opacity=".85" />
          <rect x="9.2" y="9.2" width="1.6" height="1.6" rx=".55" fill="#fff" opacity=".9" />
        </svg>
        <span className="text-sm font-semibold tracking-wide">{t('app.title')}</span>
      </div>

      <div className="flex items-center gap-1">
        {/* read-only project identity: edit only through the settings dialog (gear) */}
        <Tooltip label={t('project.name.desc')}>
          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            className="border-line bg-chip text-body hover:border-chip-line flex h-7 max-w-[168px] items-center truncate rounded-md border px-2 text-xs transition"
          >
            {projectName || t('project.untitled')}
          </button>
        </Tooltip>
        {/* conventional save affordance: enabled exactly while unsaved changes exist,
            disabled once the project matches its library entry (Photoshop/Figma-like) */}
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
        {/* project settings: name + canvas size, edited in a dialog */}
        <Tooltip label={t('project.settings')}>
          <IconButton plate title={t('project.settings')} onClick={() => setSetupOpen(true)}>
            <svg
              viewBox="0 0 16 16"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            >
              <circle cx="8" cy="8" r="2.2" />
              <path d="M13.2 9.8a5.4 5.4 0 000-3.6l1.5-1a.5.5 0 00-.1-.7l-1.9-1.4a.5.5 0 00-.6 0l-1.6 1a5.6 5.6 0 00-1.6-.9l-.3-1.9a.5.5 0 00-.5-.4h-2.2a.5.5 0 00-.5.4l-.3 1.9a5.6 5.6 0 00-1.6.9l-1.6-1a.5.5 0 00-.6 0L1.4 4.5a.5.5 0 00-.1.7l1.5 1a5.4 5.4 0 000 3.6l-1.5 1a.5.5 0 00.1.7l1.9 1.4a.5.5 0 00.6 0l1.6-1a5.6 5.6 0 001.6.9l.3 1.9a.5.5 0 00.5.4h2.2a.5.5 0 00.5-.4l.3-1.9a5.6 5.6 0 001.6-.9l1.6-1a.5.5 0 00.6 0z" />
            </svg>
          </IconButton>
        </Tooltip>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <span
          className="border-line bg-chip text-muted flex h-7 items-center rounded-md border px-2 text-xs"
          title={`${t('top.sizePreset')} — ${t('canvas.size')}`}
        >
          {doc.cols} × {doc.rows}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <IconButton plate title={t('projects.title')} onClick={() => setProjectsOpen(true)}>
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
          onClick={clear}
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

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Tooltip label={`${t('top.panel')} — ${t('top.panel.desc')}`}>
          <IconButton plate title={t('top.panel')} className="lg:hidden" onClick={onTogglePanel}>
            <svg
              viewBox="0 0 16 16"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            >
              <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
              <path d="M10.5 2.5v3M10.5 9.5v3" />
            </svg>
          </IconButton>
        </Tooltip>
        <Tooltip label={`${t('import.open.desc')} (Ctrl+V)`}>
          <button
            type="button"
            onClick={() => importFileRef.current?.click()}
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
        <input
          ref={importFileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onImportFile(file)
            e.target.value = ''
          }}
        />
        <Tooltip label={t('export.open.desc')}>
          <button
            type="button"
            onClick={() => setExportOpen((v) => !v)}
            aria-expanded={exportOpen}
            className={`flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs transition ${
              exportOpen
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
        {/* theme: one icon, dropdown with the three modes */}
        <div className="relative">
          <Tooltip label={t('top.theme')}>
            <button
              type="button"
              onClick={() => {
                setThemeOpen((v) => !v)
                setLangOpen(false)
              }}
              aria-expanded={themeOpen}
              className={`flex h-7 items-center justify-center rounded-md border px-2 text-xs transition ${
                themeOpen
                  ? 'border-accent-line bg-accent-soft text-accent-text'
                  : 'border-line bg-chip text-body hover:border-chip-line'
              }`}
            >
              <svg
                viewBox="0 0 16 16"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              >
                {themePref === 'light' ? (
                  <path d="M8 4.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z M8 1v1.5 M8 13.5V15 M1 8h1.5 M13.5 8H15 M3.2 3.2l1 1 M11.8 11.8l1 1 M12.8 3.2l-1 1 M4.2 11.8l-1 1" />
                ) : (
                  <path d="M10.5 2.5a5.5 5.5 0 00-6 8.9A5.5 5.5 0 1010.5 2.5z" />
                )}
              </svg>
            </button>
          </Tooltip>
          {themeOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setThemeOpen(false)} />
              <div className="border-line bg-panel absolute top-full right-0 z-50 mt-1 w-40 rounded-md border p-1 shadow-lg">
                {(
                  [
                    ['dark', 'theme.dark'],
                    ['light', 'theme.light'],
                    ['auto', 'theme.auto'],
                  ] as const
                ).map(([pref, key]) => (
                  <button
                    key={pref}
                    type="button"
                    onClick={() => {
                      setThemePref(pref)
                      setThemeOpen(false)
                    }}
                    className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-xs transition ${
                      themePref === pref
                        ? 'bg-accent-soft text-accent-text'
                        : 'text-body hover:bg-chip-active'
                    }`}
                  >
                    {t(key as 'theme.dark')}
                    {themePref === pref && <span>✓</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* language: one globe icon, dropdown with the languages */}
        <div className="relative">
          <Tooltip label={t('lang.switch')}>
            <button
              type="button"
              onClick={() => {
                setLangOpen((v) => !v)
                setThemeOpen(false)
              }}
              aria-expanded={langOpen}
              className={`flex h-7 items-center justify-center rounded-md border px-2 text-xs transition ${
                langOpen
                  ? 'border-accent-line bg-accent-soft text-accent-text'
                  : 'border-line bg-chip text-body hover:border-chip-line'
              }`}
            >
              <svg
                viewBox="0 0 16 16"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              >
                <circle cx="8" cy="8" r="6.2" />
                <path d="M1.8 8h12.4M8 1.8c-4.4 4-4.4 8.4 0 12.4M8 1.8c4.4 4 4.4 8.4 0 12.4" />
              </svg>
            </button>
          </Tooltip>
          {langOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setLangOpen(false)} />
              <div className="border-line bg-panel absolute top-full right-0 z-50 mt-1 w-40 rounded-md border p-1 shadow-lg">
                {(['en', 'ru'] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => {
                      setLang(l)
                      setLangOpen(false)
                    }}
                    className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-xs transition ${
                      lang === l
                        ? 'bg-accent-soft text-accent-text'
                        : 'text-body hover:bg-chip-active'
                    }`}
                  >
                    {l === 'en' ? 'English' : 'Русский'}
                    {lang === l && <span>✓</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      {projectsOpen && <ProjectsDialog onClose={() => setProjectsOpen(false)} />}
      {setupOpen && <ProjectDialog mode="edit" onClose={() => setSetupOpen(false)} />}
      {exportOpen && <ExportPopover onClose={() => setExportOpen(false)} />}
    </header>
  )
}
