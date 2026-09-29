import { useI18n } from '../shared/i18n/i18n.provider.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../shared/ui/shadcn/dropdown-menu.tsx'
import { useStore, type ThemePref } from '../state/editor.store.ts'
import { ThemeSwatchStrip } from './theme-swatches.component.tsx'

const triggerClass =
  'border-line bg-chip text-body hover:border-chip-line data-[state=open]:border-accent-line data-[state=open]:bg-accent-soft flex h-7 items-center justify-center rounded-md border px-2 text-xs transition'

const itemClass = 'text-body text-xs'

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

/** Theme dropdown: one icon in the desktop top bar opening the editor palettes + system auto. */
export function ThemeMenu() {
  const { t } = useI18n()
  const themePref = useStore((s) => s.themePref)
  const setThemePref = useStore((s) => s.setThemePref)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={t('top.theme')} className={triggerClass}>
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
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuRadioGroup
          value={themePref}
          onValueChange={(v) => setThemePref(v as ThemePref)}
        >
          {THEME_PREFS.map(([pref, key]) => (
            <DropdownMenuRadioItem key={pref} value={pref} className={`${itemClass} gap-2`}>
              <ThemeSwatchStrip pref={pref} />
              <span className="truncate">{t(key)}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Language dropdown: one globe icon in the desktop top bar switching RU/EN. */
export function LangMenu() {
  const { t } = useI18n()
  const lang = useStore((s) => s.lang)
  const setLang = useStore((s) => s.setLang)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={t('lang.switch')} className={triggerClass}>
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
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuRadioGroup value={lang} onValueChange={(v) => setLang(v as 'en' | 'ru')}>
          <DropdownMenuRadioItem value="en" className={itemClass}>
            English
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="ru" className={itemClass}>
            Русский
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
