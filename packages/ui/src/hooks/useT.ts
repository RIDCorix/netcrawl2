import { useGameStore } from '../store/gameStore'
import { createTranslator } from '../i18n/index'

export function useT() {
  const language = useGameStore(s => s.settings.language)
  return createTranslator(language)
}
