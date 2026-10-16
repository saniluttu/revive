// IndexedDB cache for cue audio fetched from /api/tts (Sarvam), so a cue missing
// from the pre-generated pack costs one API call per browser, not one per session.
// Every call fails soft: without IndexedDB (private window, blocked storage) the
// cache simply misses.

const DB_NAME = 'revive-voice'
const STORE = 'tts'
let dbPromise = null

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

function run(mode, action) {
  return openDb().then(
    (db) =>
      db &&
      new Promise((resolve) => {
        try {
          const req = action(db.transaction(STORE, mode).objectStore(STORE))
          req.onsuccess = () => resolve(req.result ?? null)
          req.onerror = () => resolve(null)
        } catch {
          resolve(null)
        }
      }),
  )
}

/** @returns {Promise<{ bytes: ArrayBuffer, type: string } | null>} */
export const getCachedAudio = (key) => run('readonly', (store) => store.get(key))

export const putCachedAudio = (key, value) => run('readwrite', (store) => store.put(value, key))
