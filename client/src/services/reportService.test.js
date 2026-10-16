import { describe, expect, it, vi } from 'vitest'
import { readReply } from './reportService.js'

const ndjson = (chunks) =>
  new Response(
    new ReadableStream({
      start(c) {
        chunks.forEach((x) => c.enqueue(new TextEncoder().encode(x)))
        c.close()
      },
    }),
    { headers: { 'content-type': 'application/x-ndjson' } },
  )

describe('readReply', () => {
  it('reports retries and returns the result, even when lines are split across chunks', async () => {
    const onRetry = vi.fn()
    const body = await readReply(
      ndjson(['{"type":"retrying","provider":"gemini"}\n{"type":"retr', 'ying"}\n{"type":"result","provider":"openrouter"}\n']),
      onRetry,
    )
    expect(onRetry).toHaveBeenCalledTimes(2)
    expect(body.provider).toBe('openrouter')
  })

  it('throws the streamed error code', async () => {
    await expect(readReply(ndjson(['{"type":"error","error":"ai_unavailable"}\n']))).rejects.toMatchObject({
      code: 'ai_unavailable',
    })
  })

  it('treats a stream that ends without a result as a network error', async () => {
    await expect(readReply(ndjson(['{"type":"retrying"}\n']))).rejects.toMatchObject({ code: 'network' })
  })

  it('reads a plain JSON reply (cache hit) and JSON errors', async () => {
    expect((await readReply(Response.json({ cached: true }))).cached).toBe(true)
    await expect(readReply(Response.json({ error: 'file_too_large' }, { status: 413 }))).rejects.toMatchObject({
      code: 'file_too_large',
    })
  })
})
