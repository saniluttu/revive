import { useTranslation } from 'react-i18next'
import Placeholder from '../components/Placeholder.jsx'

export default function Progress() {
  const { t } = useTranslation()
  return <Placeholder title={t('pages.progress.title')} subtitle={t('pages.progress.subtitle')} />
}
