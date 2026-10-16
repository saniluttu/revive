import { describe, expect, it, vi } from 'vitest'
import { questionText, VoiceError } from './voiceService.js'

const blob = new Blob(['audio'], { type: 'audio/webm' })

describe('questionText (speech-to-text order)', () => {
  it('uses Sarvam first', async () => {
    const transcribe = vi.fn(async () => 'കൈ എത്ര ഉയർത്തണം?')
    expect(await questionText(blob, 'browser text', 'ml', transcribe)).toBe('കൈ എത്ര ഉയർത്തണം?')
    expect(transcribe.mock.calls.map((c) => c[2])).toEqual(['sarvam'])
  })

  it("falls back to the browser's own transcript, then Groq Whisper", async () => {
    const failing = vi.fn(async (_b, _l, provider) => {
      if (provider === 'sarvam') throw new VoiceError('sttUnavailable')
      return 'from whisper'
    })
    expect(await questionText(blob, 'from browser', 'en', failing)).toBe('from browser')
    expect(failing.mock.calls.map((c) => c[2])).toEqual(['sarvam'])

    failing.mockClear()
    expect(await questionText(blob, '', 'en', failing)).toBe('from whisper')
    expect(failing.mock.calls.map((c) => c[2])).toEqual(['sarvam', 'groq'])
  })

  it('reports "not heard" when every engine returns nothing', async () => {
    await expect(questionText(blob, '', 'ml', async () => '')).rejects.toMatchObject({ code: 'notHeard' })
  })

  it('reports a network error when the server is unreachable and the browser heard nothing', async () => {
    const offline = vi.fn(async () => {
      throw new VoiceError('network')
    })
    await expect(questionText(blob, '', 'ml', offline)).rejects.toMatchObject({ code: 'network' })
    expect(offline).toHaveBeenCalledTimes(1) // no point asking for Groq too
  })
})
