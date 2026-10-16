import { useTranslation } from 'react-i18next'
import Placeholder from '../components/Placeholder.jsx'

export default function Chatbot() {
  const { t } = useTranslation()
  return <Placeholder title={t('pages.chat.title')} subtitle={t('pages.chat.subtitle')} />
}
