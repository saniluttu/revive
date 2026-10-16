// Copies MediaPipe's WASM runtime into public/ so pose tracking works offline.
import { cpSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const dest = resolve(root, 'public/mediapipe/wasm')

if (!existsSync(src)) {
  console.warn('[copy-mediapipe-wasm] @mediapipe/tasks-vision not installed yet, skipping')
} else {
  cpSync(src, dest, { recursive: true })
  console.log('[copy-mediapipe-wasm] copied to public/mediapipe/wasm')
}
