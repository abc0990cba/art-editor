import { useEffect, type JSX } from 'react'

import { useI18n } from '../shared/i18n/i18n.provider.tsx'
import { nextThemePref, useStore } from '../state/editor.store.ts'

/** Overflow-menu icons (16px stroke set, matches the toolbar's icon language). */
const MORE_ICONS = {
  projects: (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0 opacity-80"
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
      className="h-4 w-4 shrink-0 opacity-80"
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
  import: (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0 opacity-80"
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
      className="h-4 w-4 shrink-0 opacity-80"
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
      className="h-4 w-4 shrink-0 opacity-80"
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
      className="h-4 w-4 shrink-0 opacity-80"
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
      className="h-4 w-4 shrink-0 opacity-80"
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
      className="h-4 w-4 shrink-0 opacity-80"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    >
      <path d="M3 4.5h10M6.5 4.5v-1a1 1 0 011-1h1a1 1 0 011 1v1M5 4.5l.6 8a1 1 0 001 .9h2.8a1 1 0 001-.9l.6-8" />
    </svg>
  ),
}

/**
 * Phone/tablet overflow menu (the "…" in the mobile top bar): document actions, project dialogs,
 * theme/language cycling. Escape and the invisible backdrop close it; every row closes the menu
 * before running its action.
 */
export function TopBarMoreMenu({
  onClose,
  onProjects,
  onImport,
  onExport,
  onSettings,
  onClear,
}: {
  onClose: () => void
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const row = (label: string, icon: JSX.Element, action: () => void) => (
    <button
      type="button"
      onClick={() => {
        onClose()
        action()
      }}
      className="text-body hover:bg-chip-active flex h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm transition"
    >
      {icon}
      {label}
    </button>
  )

  const themeLabel = {
    dark: t('theme.dark'),
    paper: t('theme.paper'),
    oled: t('theme.oled'),
    nord: t('theme.nord'),
    'tokyo-night': t('theme.tokyo-night'),
    vscode: t('theme.vscode'),
    catppuccin: t('theme.catppuccin'),
    auto: t('theme.auto'),
  }[themePref]

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="border-line bg-raised fixed top-15 right-2 z-50 w-64 rounded-xl border p-1.5 shadow-2xl">
        {row(t('projects.title'), MORE_ICONS.projects, onProjects)}
        {row(nodeEditorOpen ? t('editor.close') : t('editor.open'), MORE_ICONS.nodes, () =>
          nodeEditorOpen ? closeNodeEditor() : openNodeEditor(),
        )}
        {row(t('import.open'), MORE_ICONS.import, onImport)}
        {row(t('export.open'), MORE_ICONS.export, onExport)}
        {row(t('project.settings'), MORE_ICONS.settings, onSettings)}
        {row(`${t('top.theme')}: ${themeLabel}`, MORE_ICONS.theme, () =>
          setThemePref(nextThemePref(themePref)),
        )}
        {row(`${t('lang.switch')}: ${lang === 'ru' ? 'RU' : 'EN'}`, MORE_ICONS.lang, () =>
          setLang(lang === 'ru' ? 'en' : 'ru'),
        )}
        <div className="bg-line my-1 h-px" />
        {row(t('export.clear'), MORE_ICONS.clear, onClear)}
      </div>
    </>
  )
}
