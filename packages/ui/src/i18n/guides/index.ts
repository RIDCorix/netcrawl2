/**
 * Client-side quest guide translations.
 * Falls back to server-provided English content if no translation exists.
 */

import type { GuideStep } from './types';
import { zhTW } from './zh-TW';
import { ja } from './ja';

const guideTranslations: Record<string, Record<string, GuideStep[]>> = {
  'zh-TW': zhTW,
  ja,
};

/**
 * Get translated guide steps for a quest.
 * Returns undefined if no translation exists (use server fallback).
 */
export function getTranslatedGuide(lang: string, questId: string): GuideStep[] | undefined {
  return guideTranslations[lang]?.[questId];
}
