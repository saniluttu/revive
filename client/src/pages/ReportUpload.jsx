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
  const [retrying, setRetrying] = useState(false)
  const [error, setError] = useState(null)

  async function handleAnalyze(e) {
    e.preventDefault()
    if (!file) return
    setBusy(true)
    setRetrying(false)
    setError(null)
    try {
      const result = await analyzeReport(file, { onRetry: () => setRetrying(true) })
      navigate('/report/results', { state: result })
    } catch (err) {
      setError(KNOWN_ERRORS.includes(err.code) ? err.code : 'unknown')
      setBusy(false)
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="page-title">{t('pages.report.title')}</h1>
        <p className="page-subtitle">{t('report.uploadSubtitle')}</p>
      </div>

      <form onSubmit={handleAnalyze} className="card space-y-5">
        <label
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition ${
            file ? 'border-primary bg-surface-container-low' : 'border-outline-variant hover:border-primary'
          }`}
        >
          <span className="text-headline-md">{file ? file.name : t('report.chooseFile')}</span>
          <span className="text-body-lg text-on-surface-variant">{file ? t('report.changeFile') : t('report.fileHint')}</span>
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
          <p role="alert" className="rounded-xl bg-red-50 p-4 text-body-lg font-semibold text-error">
            {t(`report.errors.${error}`)}
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="submit" className="btn-primary flex-1" disabled={!file || busy}>
            {busy ? t(retrying ? 'report.analyzingRetry' : 'report.analyzing') : t('report.analyze')}
          </button>
          <Link to="/exercises" className="btn-secondary flex-1">
            {t('report.skip')}
          </Link>
        </div>
        {busy && (
          <p role="status" className="text-center text-body-lg text-on-surface-variant">
            {t(retrying ? 'report.retryingHint' : 'report.analyzingHint')}
          </p>
        )}
      </form>

      <p className="text-base text-on-surface-variant">{t('report.privacy')}</p>
    </section>
  )
}
