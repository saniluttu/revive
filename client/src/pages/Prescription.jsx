import { useTranslation } from 'react-i18next'
import Placeholder from '../components/Placeholder.jsx'

export default function Prescription() {
  const { t } = useTranslation()
  return <Placeholder title={t('pages.prescription.title')} subtitle={t('pages.prescription.subtitle')} />
}
