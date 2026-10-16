import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApprovedPlan } from '../reviews/useReviews.js'
import { askAssistant, questionText, speak, stopSpeaking } from '../services/voiceService.js'
import { startRecording } from './recorder.js'

const MAX_RECORDING_MS = 25_000 // Sarvam's quick speech-to-text takes up to 30 s
const MAX_HISTORY = 6

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}

const STATUS_TEXT = {
  recording: 'voice.listening',
  transcribing: 'voice.transcribing',
  thinking: 'voice.thinking',
  speaking: 'voice.speaking',
}

/**
 * Push-to-talk physio assistant (F10): record → speech-to-text → /api/chat → spoken reply.
 * @param exerciseId   the exercise the patient is doing now (Live Session), if any
 * @param onBusyChange called with true while recording or speaking (the Live Session mutes its cues)
 */
export default function VoiceAsk({ exerciseId = null, onBusyChange }) {
  const { t, i18n } = useTranslation()
  const plan = useApprovedPlan()
  const [status, setStatus] = useState('idle') // idle | recording | transcribing | thinking | speaking
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState(null) // { reply, redFlag }
  const [error, setError] = useState(null)
  const recordingRef = useRef(null)
  const timerRef = useRef(null)
  const historyRef = useRef([])
  const aliveRef = useRef(true)
  const lang = i18n.language === 'ml' ? 'ml' : 'en'

  useEffect(() => {
    onBusyChange?.(status !== 'idle')
  }, [status, onBusyChange])

  useEffect(() => {
    aliveRef.current = true // StrictMode runs effects twice
    return () => {
      aliveRef.current = false
      clearTimeout(timerRef.current)
      recordingRef.current?.cancel()
      stopSpeaking()
    }
  }, [])

  async function start() {
    setError(null)
    stopSpeaking()
    try {
      recordingRef.current = await startRecording(lang)
    } catch (err) {
      setError(err.code ?? 'noMic')
      return
    }
    setStatus('recording')
    timerRef.current = setTimeout(finish, MAX_RECORDING_MS)
  }

  async function finish() {
    clearTimeout(timerRef.current)
    const recording = recordingRef.current
    recordingRef.current = null
    if (!recording) return
    setStatus('transcribing')
    try {
      const { blob, browserText } = await recording.stop()
      const text = await questionText(blob, browserText, lang)
      if (!aliveRef.current) return
      setQuestion(text)
      setAnswer(null)
      setStatus('thinking')
      const result = await askAssistant(text, { lang, exerciseId, plan, history: historyRef.current })
      if (!aliveRef.current) return
      setAnswer(result)
      const spoken = result.redFlag ? t('voice.redFlag') : result.reply
      historyRef.current = [
        ...historyRef.current,
        { role: 'user', content: text },
        { role: 'assistant', content: spoken },
      ].slice(-MAX_HISTORY)
      setStatus('speaking')
      await speak(spoken, lang)
    } catch (err) {
      if (aliveRef.current) setError(err.code ?? 'network')
    }
    if (aliveRef.current) setStatus('idle')
  }

  function stopTalking() {
    stopSpeaking()
    setStatus('idle')
  }

  const busy = status === 'transcribing' || status === 'thinking'
  const recording = status === 'recording'

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={recording ? finish : start}
          disabled={busy}
          aria-label={t(recording ? 'voice.micStop' : 'voice.micStart')}
          title={t(recording ? 'voice.micStop' : 'voice.micStart')}
          className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-white shadow-lg transition focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:opacity-50 ${
            recording ? 'animate-pulse bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary-container'
          }`}
        >
          {recording ? <StopIcon /> : <MicIcon />}
        </button>
        <div className="min-w-0">
          <h2 className="text-headline-md">{t('voice.ask')}</h2>
          <p className="text-body-lg text-on-surface-variant" role="status" aria-live="polite">
            {STATUS_TEXT[status] ? t(STATUS_TEXT[status]) : t('voice.askHint')}
          </p>
        </div>
        {status === 'speaking' && (
          <button type="button" className="btn-secondary ml-auto px-4 py-2 text-base" onClick={stopTalking}>
            {t('voice.stopSpeaking')}
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="rounded-xl bg-red-50 p-4 text-body-lg font-semibold text-error ring-1 ring-red-200">
          {t(`voice.errors.${error}`)}
        </div>
      )}

      {question && (
        <div className="space-y-3 text-body-lg">
          <div>
            <div className="text-base font-semibold uppercase tracking-wide text-on-surface-variant">{t('voice.youAsked')}</div>
            <p>{question}</p>
          </div>
          {answer && (
            <div
              className={`rounded-xl p-4 ring-1 ${
                answer.redFlag ? 'bg-red-600 text-white ring-red-700' : 'bg-surface-container-low text-on-surface ring-primary-fixed'
              }`}
            >
              {!answer.redFlag && (
                <div className="text-base font-semibold uppercase tracking-wide text-primary">{t('voice.answer')}</div>
              )}
              <p className={answer.redFlag ? 'text-headline-md' : ''}>{answer.redFlag ? t('voice.redFlag') : answer.reply}</p>
            </div>
          )}
        </div>
      )}

      <p className="text-sm text-on-surface-variant">{t('voice.disclaimer')}</p>
    </div>
  )
}
