import { useMemo } from 'react'
import { useGameStore } from '../store/gameStore'
import { createTranslator } from '../i18n/index'

export function useT() {
  const language = useGameStore(s => s.settings.language)
  return useMemo(() => createTranslator(language), [language])
}
