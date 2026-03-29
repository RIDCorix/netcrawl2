import { TRANSLATIONS } from './translations'

export type Language = 'en' | 'zh-TW' | 'ja'

export const LANGUAGES: { code: Language; label: string; flag: string }[] = [
  { code: 'en',    label: 'English',  flag: '🇺🇸' },
  { code: 'zh-TW', label: '繁體中文', flag: '🇹🇼' },
  { code: 'ja',    label: '日本語',   flag: '🇯🇵' },
]

// Translation lookup: t('key') → string
export function createTranslator(lang: Language) {
  const dict = TRANSLATIONS[lang] ?? TRANSLATIONS['en']
  return (key: string, vars?: Record<string, string | number>): string => {
    let str = dict[key] ?? TRANSLATIONS['en'][key] ?? key
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
      })
    }
    return str
  }
}

export type TranslatorFn = ReturnType<typeof createTranslator>
