import { useTranslation } from 'react-i18next'

export default function Placeholder({ title, subtitle, children }) {
  const { t } = useTranslation()
  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-bold text-on-surface sm:text-4xl">{title}</h1>
      {subtitle && <p className="text-body-xl text-on-surface-variant">{subtitle}</p>}
      <div className="card text-body-lg text-on-surface-variant">{children ?? t('common.comingSoon')}</div>
    </section>
  )
}
