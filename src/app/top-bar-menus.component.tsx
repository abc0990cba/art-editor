import { useEffect, useState } from 'react'

import { useI18n } from '../shared/i18n/i18n.provider.tsx'
import { Tooltip } from '../shared/ui/tooltip.component.tsx'
import { useStore } from '../state/editor.store.ts'

const triggerClass = (open: boolean): string =>
  `flex h-7 items-center justify-center rounded-md border px-2 text-xs transition ${
    open
      ? 'border-accent-line bg-accent-soft text-accent-text'
      : 'border-line bg-chip text-body hover:border-chip-line'
  }`

const itemClass = (active: boolean): string =>
  `flex w-full items-center justify-between rounded px-2 py-1.5 text-xs transition ${
    active ? 'bg-accent-soft text-accent-text' : 'text-body hover:bg-chip-active'
  }`

/** Escape closes an open dropdown (the invisible backdrop only handles the pointer). */
function useEscapeCloses(open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])
}

/** Theme dropdown: one icon in the desktop top bar opening the five themes + system auto. */
export function ThemeMenu() {
  const { t } = useI18n()
  const themePref = useStore((s) => s.themePref)
  const setThemePref = useStore((s) => s.setThemePref)
  const [open, setOpen] = useState(false)
  useEscapeCloses(open, () => setOpen(false))
  return (
    <div className="relative">
      <Tooltip label={t('top.theme')}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={triggerClass(open)}
        >
          <svg
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
          >
            {themePref === 'paper' ? (
              <path d="M8 4.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z M8 1v1.5 M8 13.5V15 M1 8h1.5 M13.5 8H15 M3.2 3.2l1 1 M11.8 11.8l1 1 M12.8 3.2l-1 1 M4.2 11.8l-1 1" />
            ) : (
              <path d="M10.5 2.5a5.5 5.5 0 00-6 8.9A5.5 5.5 0 1010.5 2.5z" />
            )}
          </svg>
        </button>
      </Tooltip>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="border-line bg-panel absolute top-full right-0 z-50 mt-1 w-40 rounded-md border p-1 shadow-lg">
            {(
              [
                ['dark', 'theme.dark'],
                ['vscode', 'theme.vscode'],
                ['oled', 'theme.oled'],
                ['nord', 'theme.nord'],
                ['catppuccin', 'theme.catppuccin'],
                ['paper', 'theme.paper'],
                ['tokyo-night', 'theme.tokyo-night'],
                ['auto', 'theme.auto'],
              ] as const
            ).map(([pref, key]) => (
              <button
                key={pref}
                type="button"
                onClick={() => {
                  setThemePref(pref)
                  setOpen(false)
                }}
                className={itemClass(themePref === pref)}
              >
                {t(key as 'theme.dark')}
                {themePref === pref && <span>✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** Language dropdown: one globe icon in the desktop top bar switching RU/EN. */
export function LangMenu() {
  const { t } = useI18n()
  const lang = useStore((s) => s.lang)
  const setLang = useStore((s) => s.setLang)
  const [open, setOpen] = useState(false)
  useEscapeCloses(open, () => setOpen(false))
  return (
    <div className="relative">
      <Tooltip label={t('lang.switch')}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={triggerClass(open)}
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
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="border-line bg-panel absolute top-full right-0 z-50 mt-1 w-40 rounded-md border p-1 shadow-lg">
            {(['en', 'ru'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => {
                  setLang(l)
                  setOpen(false)
                }}
                className={itemClass(lang === l)}
              >
                {l === 'en' ? 'English' : 'Русский'}
                {lang === l && <span>✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
