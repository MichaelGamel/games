/**
 * i18n bootstrap — bundled JSON resources, English + Arabic, with RTL handled
 * once at the document level. Imported for its side effects at the very top of
 * `main.tsx`, before anything renders.
 */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import enCommon from './locales/en/common.json'
import enOnline from './locales/en/online.json'
import enSnakes from './locales/en/snakes.json'
import enLudo from './locales/en/ludo.json'
import enFour from './locales/en/four.json'
import enUno from './locales/en/uno.json'
import enBank from './locales/en/bank.json'
import arCommon from './locales/ar/common.json'
import arOnline from './locales/ar/online.json'
import arSnakes from './locales/ar/snakes.json'
import arLudo from './locales/ar/ludo.json'
import arFour from './locales/ar/four.json'
import arUno from './locales/ar/uno.json'
import arBank from './locales/ar/bank.json'

const RTL_LANGS = ['ar', 'he', 'fa', 'ur'] as const

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon, online: enOnline, snakes: enSnakes, ludo: enLudo, four: enFour, uno: enUno, bank: enBank },
      ar: { common: arCommon, online: arOnline, snakes: arSnakes, ludo: arLudo, four: arFour, uno: arUno, bank: arBank },
    },
    defaultNS: 'common',
    ns: ['common', 'online', 'snakes', 'ludo', 'four', 'uno', 'bank'],
    fallbackLng: 'en',
    supportedLngs: ['en', 'ar'],
    detection: {
      // Explicit choice only (persisted by the switcher) — never surprise a
      // first-time visitor with an auto-detected language.
      order: ['localStorage'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
    interpolation: {
      escapeValue: false, // React already escapes — leaving this on double-escapes
    },
    react: {
      useSuspense: false, // translations are bundled; nothing to suspend on
    },
  })

// Keep <html lang> and <html dir> in sync with the active language. Components
// never set `dir` themselves — CSS logical properties + the cascade do the rest.
const applyDirection = (lng: string) => {
  document.documentElement.lang = lng
  document.documentElement.dir = (RTL_LANGS as readonly string[]).includes(lng) ? 'rtl' : 'ltr'
}
applyDirection(i18n.language)
i18n.on('languageChanged', applyDirection)

export default i18n
