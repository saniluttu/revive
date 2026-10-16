import { Component } from 'react'
import { useTranslation } from 'react-i18next'

function CrashMessage({ error, onRetry }) {
  const { t } = useTranslation()
  return (
    <div role="alert" className="card mx-auto max-w-2xl space-y-4 ring-red-200">
      <h1 className="text-3xl font-bold text-red-800">{t('crash.title')}</h1>
      <p className="text-lg text-slate-700">{t('crash.text')}</p>
      <button type="button" className="btn-primary" onClick={onRetry}>
        {t('crash.retry')}
      </button>
      <details className="text-sm text-slate-500">
        <summary>{t('crash.details')}</summary>
        <code className="mt-2 block whitespace-pre-wrap break-words">{String(error?.message ?? error)}</code>
      </details>
    </div>
  )
}

/** Shows a friendly message (with the error text, for bug reports) instead of a blank page when a page crashes. */
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return <CrashMessage error={this.state.error} onRetry={() => this.setState({ error: null })} />
  }
}
