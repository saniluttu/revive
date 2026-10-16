import { useTranslation } from 'react-i18next'
import Placeholder from '../components/Placeholder.jsx'

export default function ReportUpload() {
  const { t } = useTranslation()
  return <Placeholder title={t('pages.report.title')} subtitle={t('pages.report.subtitle')} />
}
