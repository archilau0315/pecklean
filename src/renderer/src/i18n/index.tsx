/** 渲染层 i18n：语言上下文、翻译函数、localStorage 持久化 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { zh } from './zh'
import { en } from './en'
import type { Lang, Translate } from './types'

export type { Lang }

const DICTS: Record<Lang, Record<string, string>> = { zh, en }
const STORAGE_KEY = 'sc-lang'

export interface I18nValue {
  lang: Lang
  setLang: (lang: Lang) => void
  t: Translate
}

const Ctx = createContext<I18nValue | null>(null)

function readLang(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'zh'
  } catch {
    return 'zh'
  }
}

export function LanguageProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [lang, setLangState] = useState<Lang>(readLang)

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* 存储不可用时仅本次生效 */
    }
  }, [])

  const t = useCallback<Translate>(
    (key, params, fallback) => {
      const raw = DICTS[lang][key] ?? zh[key] ?? fallback ?? key
      if (!params) return raw
      return raw.replace(/\{(\w+)\}/g, (m, k: string) => (params[k] !== undefined ? String(params[k]) : m))
    },
    [lang]
  )

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n(): I18nValue {
  const value = useContext(Ctx)
  if (!value) throw new Error('useI18n 必须在 LanguageProvider 内使用')
  return value
}
