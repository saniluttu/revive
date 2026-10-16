// Last successful analysis per report file (SHA-256 of its bytes), kept on disk:
// the same file is answered instantly next time, and a demo still works if every
// AI provider is down. Contains patient data: the cache directory is git-ignored.

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CACHE_FILE =
  process.env.REPORT_CACHE_FILE ||
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../../cache/report-analysis.json')

let entries = null // hash -> { analysis, provider, model, promptVersion, savedAt }

async function load() {
  if (entries) return entries
  try {
    entries = JSON.parse(await readFile(CACHE_FILE, 'utf8'))
  } catch {
    entries = {}
  }
  return entries
}

export function hashFile(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

export async function getCached(hash) {
  return (await load())[hash] ?? null
}

export async function saveCached(hash, value) {
  const all = await load()
  all[hash] = { ...value, savedAt: new Date().toISOString() }
  try {
    await mkdir(path.dirname(CACHE_FILE), { recursive: true })
    await writeFile(CACHE_FILE, JSON.stringify(all, null, 2))
  } catch (err) {
    console.warn(`[reportCache] could not write ${CACHE_FILE}: ${err.message}`)
  }
}
