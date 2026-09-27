import { useEffect, useState, type JSX } from 'react'

import { useI18n } from '../shared/i18n/i18n.provider.tsx'
import { useStore, type ThemePref } from '../state/editor.store.ts'

/** Overflow-menu icons (16px stroke set, matches the toolbar's icon language). */
const MORE_ICONS = {
  projects: (
    <svg
      viewBox="0 0 16 16"
      className="h-5 w-5 shrink-0 opacity-80"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    >
      <path d="M1.5 4.5a1 1 0 011-1h3l1.5 1.5h6a1 1 0 011 1v6a1 1 0 01-1 1h-10a1 1 0 01-1-1v-7.5z" />
    </svg>
  ),
  nodes: (
    <svg
      viewBox="0 0 16 16"
      className="h-5 w-5 shrink-0 opacity-80"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    >
      <circle cx="3.4" cy="3.4" r="1.7" />
      <circle cx="11.6" cy="7" r="1.7" />
      <circle cx="4.6" cy="11.4" r="1.7" />
      <path d="M4.8 4.4l5 1.9M10.2 8.4L6 10.7" />
    </svg>
  ),
  vector: (
    <svg
      viewBox="0 0 16 16"
      className="h-5 w-5 shrink-0 opacity-80"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    >
      <path d="M3 13L8 3l5 10" />
      <path d="M4.8 9.5h6.4" />
    </svg>
  ),
  import: (
    <svg
      viewBox="0 0 16 16"
      className="h-5 w-5 shrink-0 opacity-80"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    >
      <rect x="2" y="2.5" width="12" height="11" rx="1.2" />
      <circle cx="5.7" cy="6.2" r="1.1" />
      <path d="M2.5 11.5l3.5-3.5 2 2 2.5-2.5 3 3" />
    </svg>
  ),
  export: (
    <svg
      viewBox="0 0 16 16"
      className="h-5 w-5 shrink-0 opacity-80"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    >
      <path d="M8 2v7.5M8 9.5L5.4 6.9M8 9.5l2.6-2.6M2.5 11.5v1.5a1 1 0 001 1h9a1 1 0 001-1v-1.5" />
    </svg>
  ),
  settings: (
    <svg
      viewBox="0 0 16 16"
      className="h-5 w-5 shrink-0 opacity-80"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    >
      <circle cx="8" cy="8" r="2.2" />
      <path d="M13.2 9.8a5.4 5.4 0 000-3.6l1.5-1a.5.5 0 00-.1-.7l-1.9-1.4a.5.5 0 00-.6 0l-1.6 1a5.6 5.6 0 00-1.6-.9l-.3-1.9a.5.5 0 00-.5-.4h-2.2a.5.5 0 00-.5.4l-.3 1.9a5.6 5.6 0 00-1.6.9l-1.6-1a.5.5 0 00-.6 0L1.4 4.5a.5.5 0 00-.1.7l1.5 1a5.4 5.4 0 000 3.6l-1.5 1a.5.5 0 00.1.7l1.9 1.4a.5.5 0 00.6 0l1.6-1a5.6 5.6 0 001.6.9l.3 1.9a.5.5 0 00.5.4h2.2a.5.5 0 00.5-.4l.3-1.9a5.6 5.6 0 001.6-.9l1.6 1a.5.5 0 00.6 0z" />
    </svg>
  ),
  theme: (
    <svg
      viewBox="0 0 16 16"
      className="h-5 w-5 shrink-0 opacity-80"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    >
      <path d="M10.5 2.5a5.5 5.5 0 00-6 8.9A5.5 5.5 0 1010.5 2.5z" />
    </svg>
  ),
  lang: (
    <svg
      viewBox="0 0 16 16"
      className="h-5 w-5 shrink-0 opacity-80"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
    >
      <circle cx="8" cy="8" r="6.2" />
      <path d="M1.8 8h12.4M8 1.8c-4.4 4-4.4 8.4 0 12.4M8 1.8c4.4 4 4.4 8.4 0 12.4" />
    </svg>
  ),
  clear: (
    <svg
      viewBox="0 0 16 16"
      className="h-5 w-5 shrink-0 text-red-400 opacity-90"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    >
      <path d="M3 4.5h10M6.5 4.5v-1a1 1 0 011-1h1a1 1 0 011 1v1M5 4.5l.6 8a1 1 0 001 .9h2.8a1 1 0 001-.9l.6-8" />
    </svg>
  ),
}

const THEME_PREFS: readonly (readonly [
  ThemePref,
  (
    | 'theme.dark'
    | 'theme.vscode'
    | 'theme.oled'
    | 'theme.nord'
    | 'theme.catppuccin'
    | 'theme.paper'
    | 'theme.tokyo-night'
    | 'theme.auto'
  ),
])[] = [
  ['dark', 'theme.dark'],
  ['vscode', 'theme.vscode'],
  ['oled', 'theme.oled'],
  ['nord', 'theme.nord'],
  ['catppuccin', 'theme.catppuccin'],
  ['paper', 'theme.paper'],
  ['tokyo-night', 'theme.tokyo-night'],
  ['auto', 'theme.auto'],
]

const chipClass = (active: boolean): string =>
  `h-11 rounded-lg border px-3 text-sm transition ${
    active ? 'border-accent-line bg-accent-soft text-accent-text' : 'border-line bg-chip text-body'
  }`

/**
 * Phone/tablet overflow «…» button with a full-screen menu: large rows for document actions,
 * project dialogs and canvas clear, plus dedicated theme and language pickers — sized for thumbs.
 * Escape, the ✕ and the backdrop close it; picking an action closes it first.
 */
export function TopBarMoreMenu({
  onProjects,
  onImport,
  onExport,
  onSettings,
  onClear,
}: {
  onProjects: () => void
  /** Import hands the picked file back to the top bar's hidden input flow */
  onImport: () => void
  onExport: () => void
  onSettings: () => void
  onClear: () => void
}) {
  const { t } = useI18n()
  const lang = useStore((s) => s.lang)
  const setLang = useStore((s) => s.setLang)
  const themePref = useStore((s) => s.themePref)
  const setThemePref = useStore((s) => s.setThemePref)
  const nodeEditorOpen = useStore((s) => s.nodeEditorOpen)
  const openNodeEditor = useStore((s) => s.openNodeEditor)
  const closeNodeEditor = useStore((s) => s.closeNodeEditor)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const rowClass =
    'text-body hover:bg-chip-active flex h-14 w-full shrink-0 items-center gap-4 rounded-xl px-4 text-left text-base transition'

  const row = (icon: JSX.Element, label: string, action: () => void) => (
    <button
      type="button"
      onClick={() => {
        setOpen(false)
        action()
      }}
      className={rowClass}
    >
      {icon}
      {label}
    </button>
  )

  return (
    <>
      <button
        type="button"
        aria-label={t('top.more')}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="text-body hover:bg-chip-active flex h-10 w-10 items-center justify-center rounded-lg transition"
      >
        <svg viewBox="0 0 16 16" className="h-5 w-5" fill="currentColor">
          <circle cx="3.2" cy="8" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="12.8" cy="8" r="1.4" />
        </svg>
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="bg-panel fixed inset-0 z-50 flex flex-col gap-5 overflow-y-auto p-4">
            <div className="flex items-center justify-between">
              <span className="text-body text-base font-semibold tracking-wide">
                {t('top.more')}
              </span>
              <button
                type="button"
                aria-label={t('dialog.close')}
                onClick={() => setOpen(false)}
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

            <div className="flex flex-col gap-1">
              {row(MORE_ICONS.projects, t('projects.title'), onProjects)}
              {row(MORE_ICONS.nodes, nodeEditorOpen ? t('editor.close') : t('editor.open'), () =>
                nodeEditorOpen ? closeNodeEditor() : openNodeEditor(),
              )}
              {row(MORE_ICONS.vector, t('mode.vector'), () => {
                useStore.getState().setMode('vector')
                setOpen(false)
              })}
              {row(MORE_ICONS.import, t('import.open'), onImport)}
              {row(MORE_ICONS.export, t('export.open'), onExport)}
              {row(MORE_ICONS.settings, t('project.settings'), onSettings)}
            </div>

            <div className="border-line flex flex-col gap-2 border-t pt-4">
              <span className="text-muted text-overline font-semibold tracking-wider uppercase">
                {t('top.theme')}
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {THEME_PREFS.map(([pref, key]) => (
                  <button
                    key={pref}
                    type="button"
                    onClick={() => setThemePref(pref)}
                    className={chipClass(themePref === pref)}
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-muted text-overline font-semibold tracking-wider uppercase">
                {t('lang.switch')}
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setLang('en')}
                  className={chipClass(lang === 'en')}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => setLang('ru')}
                  className={chipClass(lang === 'ru')}
                >
                  Русский
                </button>
              </div>
            </div>

            <div className="border-line mt-auto flex flex-col gap-1 border-t pt-3">
              {row(MORE_ICONS.clear, t('export.clear'), onClear)}
            </div>
          </div>
        </>
      )}
    </>
  )
}
