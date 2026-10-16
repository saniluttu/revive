import { useTranslation } from 'react-i18next'

export default function Placeholder({ title, subtitle, children }) {
  const { t } = useTranslation()
  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">{title}</h1>
      {subtitle && <p className="text-xl text-slate-600">{subtitle}</p>}
      <div className="card text-lg text-slate-500">{children ?? t('common.comingSoon')}</div>
    </section>
  )
}
