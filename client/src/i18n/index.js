// i18next setup. All visible UI text lives in en.json / ml.json.
//
// Language choice: the toggle's last choice (localStorage) wins; until the
// user has toggled on this device we follow the patient's profile language
// (see useProfileLanguage), and before login the browser's language.

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import ml from './ml.json'

export const LANGUAGES = ['en', 'ml']
const STORAGE_KEY = 'revive.language'

function storedLanguage() {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return LANGUAGES.includes(value) ? value : null
  } catch {
    return null
  }
}

function browserLanguage() {
  return typeof navigator !== 'undefined' && navigator.language?.startsWith('ml') ? 'ml' : 'en'
}

function applyToDocument(lng) {
  // `lang` drives the Malayalam font + spacing in index.css
  if (typeof document !== 'undefined') document.documentElement.lang = lng
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ml: { translation: ml } },
  lng: storedLanguage() ?? browserLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React escapes already
  showSupportNotice: false,
})

applyToDocument(i18n.language)
i18n.on('languageChanged', applyToDocument)

/** Explicit choice from the toggle or the profile form; remembered on this device. */
export function setLanguage(lng) {
  try {
    localStorage.setItem(STORAGE_KEY, lng)
  } catch {
    // storage blocked: the choice still applies for this visit
  }
  i18n.changeLanguage(lng)
}

/** Use the profile's language unless the user has already toggled on this device. */
export function applyProfileLanguage(lng) {
  if (LANGUAGES.includes(lng) && !storedLanguage()) i18n.changeLanguage(lng)
}

export default i18n
