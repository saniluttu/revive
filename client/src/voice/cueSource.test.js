import { describe, expect, it, vi } from 'vitest'
import { cacheKey, limitConcurrency, resolveCueAudio } from './cueSource.js'

const bytes = (s) => new TextEncoder().encode(s).buffer

function deps(over = {}) {
  const cache = new Map()
  return {
    cache,
    packFile: vi.fn(async () => null),
    cacheGet: vi.fn(async (k) => cache.get(k) ?? null),
    cachePut: vi.fn(async (k, v) => cache.set(k, v)),
    tts: vi.fn(async () => ({ bytes: bytes('sarvam'), type: 'audio/mpeg' })),
    ...over,
  }
}

const cue = { id: 'rep-1', lang: 'ml', text: 'ഒന്ന്' }

describe('resolveCueAudio', () => {
  it('uses the pack file first, without calling Sarvam', async () => {
    const d = deps({ packFile: vi.fn(async () => ({ bytes: bytes('pack'), path: '/audio/ml/rep-1.mp3' })) })
    const r = await resolveCueAudio(cue, d)
    expect(r.source).toBe('pack file /audio/ml/rep-1.mp3')
    expect(d.tts).not.toHaveBeenCalled()
  })

  it('missing from the pack: asks Sarvam once, then plays from the IndexedDB cache', async () => {
    const d = deps()
    const first = await resolveCueAudio(cue, d)
    expect(first.source).toMatch(/Sarvam/)
    expect(d.tts).toHaveBeenCalledWith('ഒന്ന്', 'ml')
    expect(d.cache.has(cacheKey('ml', 'ഒന്ന്'))).toBe(true)

    const second = await resolveCueAudio(cue, d)
    expect(second.source).toMatch(/IndexedDB/)
    expect(d.tts).toHaveBeenCalledTimes(1)
  })

  it('never falls back to speechSynthesis for Malayalam', async () => {
    const d = deps({ tts: vi.fn(async () => Promise.reject(new Error('/api/tts HTTP 503'))) })
    const r = await resolveCueAudio(cue, d)
    expect(r.speak).toBeUndefined()
    expect(r.source).toBeNull()
    expect(r.error).toMatch(/HTTP 503/)
  })

  it('English may use speechSynthesis when Sarvam fails', async () => {
    const d = deps({ tts: vi.fn(async () => Promise.reject(new Error('down'))) })
    const r = await resolveCueAudio({ id: 'rep-1', lang: 'en', text: 'One' }, d)
    expect(r).toMatchObject({ speak: true, source: expect.stringMatching(/speechSynthesis/) })
  })

  it('a broken cache never stops playback', async () => {
    const d = deps({ cacheGet: vi.fn(async () => Promise.reject(new Error('blocked'))), cachePut: vi.fn(async () => Promise.reject(new Error('blocked'))) })
    expect((await resolveCueAudio(cue, d)).bytes).toBeTruthy()
  })
})

describe('limitConcurrency', () => {
  it('runs at most N calls at once', async () => {
    let active = 0
    let peak = 0
    const slow = limitConcurrency(async (x) => {
      active++
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 5))
      active--
      return x * 2
    }, 2)
    expect(await Promise.all([1, 2, 3, 4, 5].map((x) => slow(x)))).toEqual([2, 4, 6, 8, 10])
    expect(peak).toBe(2)
  })
})
