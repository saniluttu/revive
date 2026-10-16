import { useTranslation } from 'react-i18next'
import { translateMessage } from './message.js'

/** Returns a function that renders a Message (see message.js) in the active language. */
export default function useMessage() {
  const { t, i18n } = useTranslation()
  return (m) => translateMessage(t, m, i18n.language)
}
