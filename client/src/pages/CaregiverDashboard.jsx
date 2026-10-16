import { useTranslation } from 'react-i18next'
import Placeholder from '../components/Placeholder.jsx'

export default function CaregiverDashboard() {
  const { t } = useTranslation()
  return <Placeholder title={t('pages.caregiver.title')} subtitle={t('pages.caregiver.subtitle')} />
}
