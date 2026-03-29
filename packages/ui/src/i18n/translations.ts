import { en } from './en'
import { zhTW } from './zh-TW'
import { ja } from './ja'
import type { Language } from './index'

export const TRANSLATIONS: Record<Language, Record<string, string>> = {
  'en': en,
  'zh-TW': zhTW,
  'ja': ja,
}
