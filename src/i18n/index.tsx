import { createContext, useContext, type ReactNode } from 'react'
import type { Dict, Lang } from './en'
import { en } from './en'
import { ru } from './ru'
import { useStore } from '../state/store'

const dicts: Record<Lang, Dict> = { en, ru }

interface I18n {
  t: (key: keyof Dict) => string
  lang: Lang
  setLang: (lang: Lang) => void
}

const Ctx = createContext<I18n>({
  t: (key) => en[key],
  lang: 'en',
  setLang: () => {},
})

export function I18nProvider({ children }: { children: ReactNode }) {
  const lang = useStore((s) => s.lang)
  const setLang = useStore((s) => s.setLang)
  const t = (key: keyof Dict) => dicts[lang][key] ?? en[key]
  return <Ctx.Provider value={{ t, lang, setLang }}>{children}</Ctx.Provider>
}

export function useI18n(): I18n {
  return useContext(Ctx)
}
