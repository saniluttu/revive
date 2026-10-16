// 3D avatar demonstration (F5): the avatar plus Play/Pause, speed, camera
// angle, mirror and repeat controls, and a caption with the current step.
//
// Sync with voice: pass `step` (useInstructions().step) and the avatar shows
// the step being read — moving up on step 0, holding on 1, lowering on 2.
// When the reading ends it goes back to looping. `onStep` (and onAvatarStep in
// events.js) report every phase change the other way round.

import { Component, lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import './i18n.js'
import { motionFor, PHASE_STEP } from './motions.js'
import { createPlayer, SPEEDS } from './player.js'

const AvatarCanvas = lazy(() => import('./AvatarCanvas.jsx'))

function webglAvailable() {
  try {
    const c = document.createElement('canvas')
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2')) || !!c.getContext('webgl')
  } catch {
    return false
  }
}

class CanvasBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(err) {
    console.warn('[avatar] 3D view failed', err)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** True while the element is on screen. */
function useOnScreen(ref) {
  const [on, setOn] = useState(true)
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { rootMargin: '100px' })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [ref])
  return on
}

function Toggle({ pressed, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`rounded-xl px-2.5 py-1.5 text-base font-semibold ring-1 transition ${
        pressed ? 'bg-primary text-white ring-primary' : 'bg-surface-container-lowest text-on-surface-variant ring-outline-variant hover:ring-primary'
      }`}
    >
      {children}
    </button>
  )
}

function Segmented({ label, options, value, onChange }) {
  return (
    <div role="group" aria-label={label} className="inline-flex overflow-hidden rounded-xl ring-1 ring-outline-variant">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1.5 text-base font-semibold transition ${
            value === o.value ? 'bg-primary text-white' : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * @param exercise         library exercise
 * @param step             instruction step being read aloud (−1, 0…), or null
 * @param onStep           called with { exerciseId, phase, step, rep, source } on each phase change
 * @param defaultMirrored  start in mirror mode
 * @param className        sizes the panel; the 3D view fills the space above the controls
 */
export default function AvatarPanel({ exercise, defaultMirrored = false, ...rest }) {
  // Speed, repeat and mirror carry over when the exercise changes
  const [prefs, setPrefs] = useState({ speed: 1, loop: true, mirrored: defaultMirrored })
  if (!motionFor(exercise.id)) return null
  return <ExerciseAvatar key={exercise.id} exercise={exercise} prefs={prefs} setPrefs={setPrefs} {...rest} />
}

function ExerciseAvatar({ exercise, step = null, onStep, prefs, setPrefs, className = '' }) {
  const { t } = useTranslation()
  const [ui, setUi] = useState({ playing: true, speed: prefs.speed, loop: prefs.loop, rep: 0 })
  const [view, setView] = useState(exercise.view)
  const [current, setCurrent] = useState({ step: -1, rep: 0 })
  const [webgl] = useState(webglAvailable)
  const boxRef = useRef(null)
  const visible = useOnScreen(boxRef)
  const { mirrored } = prefs

  const [player] = useState(() =>
    createPlayer(motionFor(exercise.id), {
      speed: prefs.speed,
      loop: prefs.loop,
      autoplay: true,
      onChange: (s) => {
        setUi(s)
        setPrefs((p) => ({ ...p, speed: s.speed, loop: s.loop }))
      },
    }),
  )
  useEffect(
    () =>
      player.listen((e) => {
        setCurrent({ step: e.step, rep: e.rep })
        onStep?.(e)
      }),
    [player, onStep],
  )

  // Follow the instructions being read aloud, then go back to looping
  const following = useRef(false)
  useEffect(() => {
    if (step != null) {
      following.current = true
      player.followStep(step)
    } else if (following.current) {
      following.current = false
      player.seek('rest')
      player.play()
    }
  }, [step, player])

  const steps = t(`exercises.${exercise.id}.steps`, { returnObjects: true })
  const caption = current.step === PHASE_STEP.rest ? t('avatar.startPosition') : steps[current.step]
  const unavailable = <p className="p-6 text-center text-body-lg text-on-surface-variant">{t('avatar.unavailable')}</p>

  return (
    <div className={`flex flex-col overflow-hidden rounded-xl bg-surface-container-lowest shadow-soft ring-1 ring-outline-variant/40 ${className}`}>
      <div className="flex items-baseline justify-between gap-2 px-4 pt-3">
        <h2 className="text-label-lg">{t('avatar.title')}</h2>
        {ui.loop && current.rep > 0 && (
          <span className="text-base font-semibold text-on-surface-variant">{t('avatar.rep', { count: current.rep + 1 })}</span>
        )}
      </div>
      <p aria-live="polite" className="min-h-[3.5rem] px-4 pt-1 text-body-lg font-semibold leading-snug text-primary">
        {caption}
      </p>

      <div ref={boxRef} className="relative min-h-[300px] flex-1 bg-gradient-to-b from-sky-50 to-slate-100">
        {webgl ? (
          <CanvasBoundary fallback={unavailable}>
            <Suspense
              fallback={<div className="absolute inset-0 flex items-center justify-center text-body-lg text-on-surface-variant">{t('avatar.loading')}</div>}
            >
              <div className="absolute inset-0">
                <AvatarCanvas
                  player={player}
                  playing={ui.playing}
                  view={view}
                  mirrored={mirrored}
                  visible={visible}
                  label={t('avatar.label', { name: t(`exercises.${exercise.id}.name`) })}
                />
              </div>
            </Suspense>
          </CanvasBoundary>
        ) : (
          unavailable
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-outline-variant/60 p-2.5">
        <button type="button" className="btn-primary px-3 py-1.5 text-base" onClick={player.toggle} aria-pressed={ui.playing}>
          {ui.playing ? `❚❚ ${t('avatar.pause')}` : `▶ ${t('avatar.play')}`}
        </button>
        <Segmented
          label={t('avatar.speed')}
          value={ui.speed}
          onChange={player.setSpeed}
          options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))}
        />
        <Segmented
          label={t('avatar.view')}
          value={view}
          onChange={setView}
          options={[
            { value: 'front', label: t('avatar.front') },
            { value: 'side', label: t('avatar.side') },
          ]}
        />
        <Toggle pressed={mirrored} onClick={() => setPrefs((p) => ({ ...p, mirrored: !p.mirrored }))}>
          {t('avatar.mirror')}
        </Toggle>
        <Toggle pressed={ui.loop} onClick={() => player.setLoop(!ui.loop)}>
          {t('avatar.loop')}
        </Toggle>
      </div>
    </div>
  )
}
