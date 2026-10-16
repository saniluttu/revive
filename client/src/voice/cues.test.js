import { describe, expect, it, vi } from 'vitest'
import en from '../i18n/en.json'
import ml from '../i18n/ml.json'
import { RULES } from '../exercises/rules.js'
import { createCueQueue } from './cuePlayer.js'
import { cuesForUpdate, cueTexts } from './cues.js'

const snap = (over = {}) => ({
  status: 'active',
  attempts: 0,
  lastAttempt: null,
  activeFaults: [],
  correction: { key: 'exercises.mini-squat.cues.start' },
  ...over,
})

describe('cue texts', () => {
  it('has rep numbers 1–20, the event cues and a correction per form rule, in both languages', () => {
    for (const dict of [en, ml]) {
      const texts = cueTexts(dict)
      for (let n = 1; n <= 20; n++) expect(texts[`rep-${n}`]).toBeTruthy()
      for (const id of ['wellDone', 'rest', 'setComplete', 'notCounted', 'higher']) expect(texts[id]).toBeTruthy()
      for (const rule of Object.keys(RULES)) expect(texts[`fix-${rule}`]).toBeTruthy()
    }
    expect(Object.keys(cueTexts(ml)).sort()).toEqual(Object.keys(cueTexts(en)).sort())
  })
})

describe('cuesForUpdate', () => {
  it('says the rep number when a rep is counted', () => {
    const next = snap({ attempts: 1, lastAttempt: { counted: true, rep: 3 } })
    expect(cuesForUpdate(snap(), next)).toEqual({ ids: ['rep-3'], priority: 'high' })
  })

  it('adds "set complete" and "rest" on the last rep of a set, "well done" on the last set', () => {
    const rest = snap({ status: 'rest', attempts: 1, lastAttempt: { counted: true, rep: 10 } })
    expect(cuesForUpdate(snap(), rest).ids).toEqual(['rep-10', 'setComplete', 'rest'])
    const done = snap({ status: 'done', attempts: 1, lastAttempt: { counted: true, rep: 10 } })
    expect(cuesForUpdate(snap(), done).ids).toEqual(['rep-10', 'wellDone'])
  })

  it('says "not counted" and the reason for a rejected rep', () => {
    const next = snap({ attempts: 1, lastAttempt: { counted: false, reason: 'shrug' } })
    expect(cuesForUpdate(snap(), next)).toEqual({ ids: ['notCounted', 'fix-shrug'], priority: 'high' })
  })

  it('says a correction once when a wrong movement starts, with low priority', () => {
    const fault = snap({ activeFaults: ['kneesIn'] })
    expect(cuesForUpdate(snap(), fault)).toEqual({ ids: ['fix-kneesIn'], priority: 'low' })
    expect(cuesForUpdate(fault, snap({ activeFaults: ['kneesIn'] }))).toBeNull()
  })

  it('asks to go higher after a partial rep', () => {
    const partial = snap({ correction: { key: 'exercises.mini-squat.cues.partial' } })
    expect(cuesForUpdate(snap(), partial).ids).toEqual(['higher'])
  })

  it('stays quiet when nothing happened', () => {
    expect(cuesForUpdate(snap(), snap())).toBeNull()
    expect(cuesForUpdate(null, snap())).toBeNull()
  })
})

describe('cue queue', () => {
  function setup() {
    let t = 0
    const played = []
    const pending = []
    const output = {
      play: vi.fn((id, lang) => {
        played.push(`${lang}:${id}`)
        return new Promise((resolve) => pending.push(resolve))
      }),
      stop: vi.fn(() => pending.splice(0).forEach((r) => r())),
    }
    const queue = createCueQueue({ output, now: () => t })
    const finish = async () => {
      pending.shift()?.()
      await Promise.resolve()
      await Promise.resolve()
    }
    return { queue, played, output, finish, advance: (ms) => (t += ms) }
  }

  it('plays a sequence in order', async () => {
    const { queue, played, finish } = setup()
    queue.say({ ids: ['rep-10', 'setComplete', 'rest'], priority: 'high' }, 'ml')
    await finish()
    await finish()
    expect(played).toEqual(['ml:rep-10', 'ml:setComplete', 'ml:rest'])
  })

  it('does not repeat the same cue within 3 s', async () => {
    const { queue, played, finish, advance } = setup()
    queue.say({ ids: ['fix-shrug'], priority: 'low' }, 'en')
    await finish()
    advance(2000)
    queue.say({ ids: ['fix-shrug'], priority: 'low' }, 'en')
    expect(played).toEqual(['en:fix-shrug'])
    advance(1500)
    queue.say({ ids: ['fix-shrug'], priority: 'low' }, 'en')
    expect(played).toEqual(['en:fix-shrug', 'en:fix-shrug'])
  })

  it('drops a correction while something plays, but a rep interrupts', () => {
    const { queue, played, output } = setup()
    queue.say({ ids: ['fix-kneesIn'], priority: 'low' }, 'en')
    queue.say({ ids: ['fix-leanForward'], priority: 'low' }, 'en')
    expect(played).toEqual(['en:fix-kneesIn'])
    queue.say({ ids: ['rep-2'], priority: 'high' }, 'en')
    expect(output.stop).toHaveBeenCalled()
    expect(played).toEqual(['en:fix-kneesIn', 'en:rep-2'])
  })
})
