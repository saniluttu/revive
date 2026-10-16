import { useTranslation } from 'react-i18next'
import Placeholder from '../components/Placeholder.jsx'

export default function Reminders() {
  const { t } = useTranslation()
  return <Placeholder title={t('pages.reminders.title')} subtitle={t('pages.reminders.subtitle')} />
}
