import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApprovedPlan } from '../reviews/useReviews.js'
import { askAssistant, questionText, speak, stopSpeaking } from '../services/voiceService.js'
import { startRecording } from '../voice/recorder.js'

const MAX_RECORDING_MS = 25_000
const HOLD_MS = 450 // pressed longer than this = hold-to-talk (release sends); shorter = tap to start/stop
const MAX_HISTORY = 6
const PROVIDER_NAMES = { ollama: 'Ollama (local)', groq: 'Groq', gemini: 'Gemini', openrouter: 'OpenRouter' }

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
    </svg>
  )
}

function Bubble({ message }) {
  const { t } = useTranslation()
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-3xl rounded-br-md bg-brand-600 px-5 py-3 text-lg text-white sm:text-xl">
          {message.viaVoice && <span className="mr-2" aria-label={t('chat.spoken')}>🎤</span>}
          {message.text}
        </div>
      </div>
    )
  }
  if (message.redFlag) {
    return (
      <div role="alert" className="max-w-[90%] rounded-3xl rounded-bl-md bg-red-600 px-5 py-4 text-white ring-4 ring-red-200">
        <div className="text-base font-bold uppercase tracking-wide">⚠ {t('chat.redFlagTitle')}</div>
        <p className="mt-1 text-xl font-bold sm:text-2xl">{t('voice.redFlag')}</p>
      </div>
    )
  }
  return (
    <div className="max-w-[85%] space-y-2 rounded-3xl rounded-bl-md bg-white px-5 py-3 shadow-sm ring-1 ring-slate-200">
      <p className="text-lg sm:text-xl">{message.text}</p>
      {message.provider && (
        <span className="inline-block rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">
          {t('chat.answeredBy', { name: PROVIDER_NAMES[message.provider] ?? message.provider })}
        </span>
      )}
    </div>
  )
}

const STATUS_TEXT = { recording: 'voice.listening', transcribing: 'voice.transcribing', thinking: 'voice.thinking', speaking: 'voice.speaking' }

export default function Chatbot() {
  const { t, i18n } = useTranslation()
  const plan = useApprovedPlan()
  const lang = i18n.language === 'ml' ? 'ml' : 'en'
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState('idle') // idle | recording | transcribing | thinking | speaking
  const [error, setError] = useState(null)
  const [speakReplies, setSpeakReplies] = useState(true)
  const recordingRef = useRef(null)
  const pressRef = useRef(0)
  const startedRef = useRef(false) // this press started the recording
  const timerRef = useRef(null)
  const aliveRef = useRef(true)
  const endRef = useRef(null)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      clearTimeout(timerRef.current)
      recordingRef.current?.cancel()
      stopSpeaking()
    }
  }, [])

  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), [messages, status])

  async function ask(question, viaVoice = false) {
    const text = question.trim()
    if (!text || status === 'thinking') return
    setError(null)
    stopSpeaking()
    const history = messages
      .filter((m) => !m.redFlag)
      .slice(-MAX_HISTORY)
      .map((m) => ({ role: m.role, content: m.text }))
    setMessages((list) => [...list, { role: 'user', text, viaVoice }])
    setDraft('')
    setStatus('thinking')
    try {
      const result = await askAssistant(text, { lang, plan, history })
      if (!aliveRef.current) return
      const spoken = result.redFlag ? t('voice.redFlag') : result.reply
      setMessages((list) => [...list, { role: 'assistant', text: spoken, redFlag: result.redFlag, provider: result.redFlag ? null : result.provider }])
      if (speakReplies || viaVoice || result.redFlag) {
        setStatus('speaking')
        await speak(spoken, lang)
      }
    } catch (err) {
      if (aliveRef.current) setError(err.code ?? 'network')
    }
    if (aliveRef.current) setStatus('idle')
  }

  async function startTalking() {
    setError(null)
    stopSpeaking()
    try {
      recordingRef.current = await startRecording(lang)
    } catch (err) {
      setError(err.code ?? 'noMic')
      return
    }
    setStatus('recording')
    timerRef.current = setTimeout(stopTalking, MAX_RECORDING_MS)
  }

  async function stopTalking() {
    clearTimeout(timerRef.current)
    const recording = recordingRef.current
    recordingRef.current = null
    if (!recording) return
    setStatus('transcribing')
    try {
      const { blob, browserText } = await recording.stop()
      const text = await questionText(blob, browserText, lang)
      if (!aliveRef.current) return
      setStatus('idle')
      await ask(text, true)
    } catch (err) {
      if (aliveRef.current) {
        setError(err.code ?? 'sttUnavailable')
        setStatus('idle')
      }
    }
  }

  // Tap: start, tap again to send. Hold: talk while pressed, release to send.
  function onMicDown(e) {
    pressRef.current = e.timeStamp
    startedRef.current = !recordingRef.current
    if (startedRef.current) startTalking()
  }
  function onMicUp(e) {
    const held = e.timeStamp - pressRef.current
    if (!startedRef.current || held >= HOLD_MS) stopTalking()
  }
  // Keyboard (Enter / Space): toggle
  function onMicClick(e) {
    if (e.detail !== 0) return // mouse / touch handled by pointer events
    if (recordingRef.current) stopTalking()
    else startTalking()
  }

  const busy = status === 'transcribing' || status === 'thinking'
  const suggestions = [t('chat.suggestions', { returnObjects: true })].flat().filter((q) => typeof q === 'string')
  const recording = status === 'recording'

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-3xl font-bold sm:text-4xl">{t('pages.chat.title')}</h1>
        <p className="mt-1 text-xl text-slate-600">{t('pages.chat.subtitle')}</p>
      </div>

      <div className="card min-h-[18rem] space-y-4 bg-slate-50" aria-live="polite">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-lg text-slate-600">{t('chat.tryAsking')}</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((q) => (
                <button key={q} type="button" className="rounded-full bg-white px-4 py-2 text-lg font-semibold text-brand-800 ring-2 ring-brand-100 hover:bg-brand-50" onClick={() => ask(q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <Bubble key={i} message={m} />
        ))}
        {STATUS_TEXT[status] && <p className="text-lg font-semibold text-slate-500">{t(STATUS_TEXT[status])}</p>}
        <div ref={endRef} />
      </div>

      {error && (
        <div role="alert" className="rounded-2xl bg-red-50 p-4 text-lg font-semibold text-red-800 ring-1 ring-red-200">
          {t(`voice.errors.${error}`, { defaultValue: t('errors.unknown') })}
        </div>
      )}

      <div className="card flex flex-col items-center gap-4 sm:flex-row">
        <button
          type="button"
          onPointerDown={onMicDown}
          onPointerUp={onMicUp}
          onClick={onMicClick}
          disabled={busy}
          aria-label={t(recording ? 'voice.micStop' : 'voice.micStart')}
          className={`flex h-24 w-24 shrink-0 select-none items-center justify-center rounded-full text-white shadow-lg transition disabled:opacity-50 ${
            recording ? 'animate-pulse bg-red-600' : 'bg-brand-600 hover:bg-brand-700'
          }`}
        >
          <MicIcon />
        </button>
        <form
          className="flex w-full gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            ask(draft)
          }}
        >
          <input
            className="min-w-0 flex-1 rounded-2xl border-2 border-slate-300 px-4 py-3 text-lg"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('chat.placeholder')}
            aria-label={t('chat.placeholder')}
          />
          <button type="submit" className="btn-primary" disabled={busy || !draft.trim()}>
            {t('chat.send')}
          </button>
        </form>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-base text-slate-500">{t(recording ? 'chat.micRecording' : 'chat.micHint')}</p>
        <label className="inline-flex items-center gap-2 text-lg font-semibold">
          <input type="checkbox" className="h-6 w-6 accent-brand-600" checked={speakReplies} onChange={(e) => setSpeakReplies(e.target.checked)} />
          {t('chat.speakReplies')}
        </label>
      </div>
      <p className="text-sm text-slate-500">{t('voice.disclaimer')}</p>
    </section>
  )
}
