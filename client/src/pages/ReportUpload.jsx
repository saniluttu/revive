import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { analyzeReport, REPORT_TYPES } from '../services/reportService.js'

const KNOWN_ERRORS = ['unsupported_file', 'file_too_large', 'network', 'ai_unavailable', 'read_failed']

export default function ReportUpload() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleAnalyze(e) {
    e.preventDefault()
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const result = await analyzeReport(file)
      navigate('/report/results', { state: result })
    } catch (err) {
      setError(KNOWN_ERRORS.includes(err.code) ? err.code : 'unknown')
      setBusy(false)
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold sm:text-4xl">{t('pages.report.title')}</h1>
        <p className="mt-1 text-xl text-slate-600">{t('report.uploadSubtitle')}</p>
      </div>

      <form onSubmit={handleAnalyze} className="card space-y-5">
        <label
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed p-8 text-center transition ${
            file ? 'border-brand-600 bg-brand-50' : 'border-slate-300 hover:border-brand-500'
          }`}
        >
          <span className="text-2xl font-bold">{file ? file.name : t('report.chooseFile')}</span>
          <span className="text-lg text-slate-600">{file ? t('report.changeFile') : t('report.fileHint')}</span>
          <input
            type="file"
            accept={REPORT_TYPES.join(',')}
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null)
              setError(null)
            }}
          />
        </label>

        {error && (
          <p role="alert" className="rounded-2xl bg-red-50 p-4 text-lg font-semibold text-red-700">
            {t(`report.errors.${error}`)}
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="submit" className="btn-primary flex-1" disabled={!file || busy}>
            {busy ? t('report.analyzing') : t('report.analyze')}
          </button>
          <Link to="/exercises" className="btn-secondary flex-1">
            {t('report.skip')}
          </Link>
        </div>
        {busy && <p className="text-center text-lg text-slate-600">{t('report.analyzingHint')}</p>}
      </form>

      <p className="text-base text-slate-500">{t('report.privacy')}</p>
    </section>
  )
}
