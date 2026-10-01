/**
 * Landing pages (`/`, `/en/`): all rendering is static HTML that crawlers see without JavaScript.
 * This module adds progressive-only behavior:
 *
 * - The theme toggle cycles dark → black (OLED) → light and persists the choice in `glyph.theme`, so
 *   the app opens with the same palette;
 * - Scroll-reveal animations (elements are hidden only once `.js` is set on <html>, so crawlers and
 *   no-JS visitors always see the full content);
 * - Language links remember the choice (`glyph.lang`) so the editor opens in it;
 * - The footer year stays current. The initial theme bootstrap is a separate inline head script: it
 *   must run before first paint, before the module graph even starts loading.
 */

const doc = document.documentElement
doc.classList.add('js')

/* --- theme toggle: a minimal 3-stop cycle over the app's own palettes -------- */

const STOPS = ['dark', 'oled', 'paper'] as const
type Stop = (typeof STOPS)[number]

const LABELS: Record<'ru' | 'en', Record<Stop, string>> = {
  ru: { dark: 'Тема: тёмная', oled: 'Тема: чёрная', paper: 'Тема: светлая' },
  en: { dark: 'Theme: dark', oled: 'Theme: black', paper: 'Theme: light' },
}

const lang: 'ru' | 'en' = doc.lang === 'ru' ? 'ru' : 'en'

const ariaFor = (theme: string): string => {
  const stop: Stop = (STOPS as readonly string[]).includes(theme) ? (theme as Stop) : 'dark'
  return LABELS[lang][stop]
}

const toggle = document.querySelector<HTMLButtonElement>('[data-theme-toggle]')
if (toggle) {
  const current = doc.dataset['theme'] ?? 'dark'
  toggle.setAttribute('aria-label', ariaFor(current))

  toggle.addEventListener('click', () => {
    const at = STOPS.indexOf((doc.dataset['theme'] ?? 'dark') as Stop)
    const next: Stop = STOPS[(at + 1) % STOPS.length] ?? 'dark'
    doc.dataset['theme'] = next
    toggle.setAttribute('aria-label', ariaFor(next))
    try {
      localStorage.setItem('glyph.theme', next)
    } catch {
      /* storage unavailable (private mode) — the palette still switches for this page */
    }
  })
}

/* --- language menu: mirrors the editor's LangMenu — globe chip → radio dropdown.
   Choosing a language navigates (plain links); the data-lang handler below persists it */

const langMenu = document.querySelector<HTMLElement>('.lang-menu')
const langToggle = document.querySelector<HTMLButtonElement>('.lang-toggle')

if (langMenu && langToggle) {
  const dropdown = langMenu.querySelector<HTMLElement>('.lang-dropdown')
  const setOpen = (open: boolean): void => {
    langToggle.setAttribute('aria-expanded', String(open))
    dropdown?.toggleAttribute('hidden', !open)
  }

  langToggle.addEventListener('click', () => {
    setOpen(langToggle.getAttribute('aria-expanded') !== 'true')
  })

  document.addEventListener('click', (event) => {
    if (
      langToggle.getAttribute('aria-expanded') === 'true' &&
      event.target instanceof Node &&
      !langMenu.contains(event.target)
    ) {
      setOpen(false)
    }
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && langToggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false)
      langToggle.focus()
    }
  })
}

/* --- scroll-reveal: show each piece once, as it enters the viewport ---------- */

const revealed = document.querySelectorAll<HTMLElement>('.reveal')
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible')
          io.unobserve(entry.target)
        }
      }
    },
    { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
  )
  for (const el of revealed) io.observe(el)
} else {
  for (const el of revealed) el.classList.add('is-visible')
}

/* --- language links persist the choice before navigating --------------------- */

for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-lang]')) {
  link.addEventListener('click', () => {
    const value = link.dataset['lang']
    if (value !== 'en' && value !== 'ru') return
    try {
      localStorage.setItem('glyph.lang', value)
    } catch {
      /* storage unavailable (private mode) — the navigation itself still works */
    }
  })
}

/* --- footer year -------------------------------------------------------------- */

const year = document.querySelector<HTMLSpanElement>('#year')
if (year) year.textContent = String(new Date().getFullYear())
