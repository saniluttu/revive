import { useTranslation } from 'react-i18next'
import Placeholder from '../components/Placeholder.jsx'

export default function SessionSummary() {
  const { t } = useTranslation()
  return <Placeholder title={t('pages.summary.title')} subtitle={t('pages.summary.subtitle')} />
}
