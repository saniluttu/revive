// Renders each exercise's start and peak pose from the 3D avatar to
//   client/public/images/exercises/<id>-start.png  and  <id>-peak.png
// (original images, no remote assets). Run once after changing a motion:
//
//   npm i --no-save playwright-core@1.49.1 && npx playwright-core install chromium-headless-shell
//   npm run dev            (in another terminal; or set RENDER_URL)
//   node scripts/render-exercise-images.js

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { EXERCISES } from '../src/exercises/library.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(here, '..', 'public', 'images', 'exercises')
const BASE = process.env.RENDER_URL ?? 'http://localhost:5173'

const { chromium } = await import('playwright-core').catch(() => {
  console.error('playwright-core is missing: npm i --no-save playwright-core@1.49.1 && npx playwright-core install chromium-headless-shell')
  process.exit(1)
})

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 520, height: 400 }, deviceScaleFactor: 2 })
for (const { id } of EXERCISES) {
  for (const pose of ['start', 'peak']) {
    await page.goto(`${BASE}/render-exercise-images.html?exercise=${id}&pose=${pose}`)
    await page.waitForFunction(() => window.__stillReady === true, null, { timeout: 30_000 })
    const file = path.join(OUT, `${id}-${pose}.png`)
    await page.locator('canvas').screenshot({ path: file, omitBackground: true })
    console.log('saved', path.relative(process.cwd(), file))
  }
}
await browser.close()
