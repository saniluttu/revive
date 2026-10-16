// Local text extraction for reports, so the LLM gets text instead of the file:
//   PDF   → its text layer (pdfjs-dist); if that's under MIN_PDF_CHARS (a scan),
//           render the first pages to images and OCR them
//   image → OCR (tesseract.js, English + Malayalam if the Malayalam data loads)
// Nothing here calls an external AI. Tesseract downloads its language data once
// into server/cache/tessdata.

import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MIN_PDF_CHARS = 50
const MAX_OCR_PAGES = Number(process.env.OCR_MAX_PAGES) || 5
const MAX_RENDER_PX = 3000 // longest side of a rendered page
const RENDER_SCALE = 3 // ≈ 216 dpi, good for OCR
const OCR_LANGS = (process.env.OCR_LANGS || 'eng+mal').split('+').filter(Boolean)

const here = path.dirname(fileURLToPath(import.meta.url))
const TESSDATA_DIR = process.env.TESSDATA_CACHE || path.join(here, '../../cache/tessdata')
const require = createRequire(import.meta.url)
const STANDARD_FONTS = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts') + path.sep

/** Collapse OCR / PDF whitespace noise; keep line breaks. */
export function cleanText(text) {
  return String(text ?? '')
    .replace(/\r/g, '')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ---------- OCR ----------

let workerPromise = null

async function startWorker() {
  const { createWorker } = await import('tesseract.js')
  mkdirSync(TESSDATA_DIR, { recursive: true })
  const options = { cachePath: TESSDATA_DIR, errorHandler: () => {} }
  try {
    const worker = await createWorker(OCR_LANGS, 1, options)
    console.log(`[extract] OCR ready (${OCR_LANGS.join('+')})`)
    return { worker, langs: OCR_LANGS.join('+') }
  } catch (err) {
    if (OCR_LANGS.length === 1 && OCR_LANGS[0] === 'eng') throw err
    console.warn(`[extract] OCR languages ${OCR_LANGS.join('+')} unavailable (${err.message ?? err}) — using eng only`)
    return { worker: await createWorker('eng', 1, options), langs: 'eng' }
  }
}

function ocrWorker() {
  workerPromise ??= startWorker().catch((err) => {
    workerPromise = null // try again on the next report
    throw err
  })
  return workerPromise
}

/** @param {Buffer[]} images PNG/JPEG buffers @returns {Promise<{text:string, langs:string}>} */
async function ocr(images) {
  const { worker, langs } = await ocrWorker()
  const pages = []
  for (const image of images) {
    const { data } = await worker.recognize(image)
    pages.push(data.text)
  }
  return { text: cleanText(pages.join('\n\n')), langs }
}

// ---------- PDF ----------

async function openPdf(bytes) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: STANDARD_FONTS,
    isEvalSupported: false,
    disableFontFace: true,
    verbosity: 0,
  })
  return { task, pdf: await task.promise }
}

async function pdfText(pdf) {
  const pages = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n)
    const content = await page.getTextContent()
    // hasEOL marks line ends; join items on a line with spaces
    pages.push(content.items.map((it) => (it.str ?? '') + (it.hasEOL ? '\n' : ' ')).join(''))
    page.cleanup()
  }
  return cleanText(pages.join('\n\n'))
}

async function renderPages(pdf) {
  const images = []
  for (let n = 1; n <= Math.min(pdf.numPages, MAX_OCR_PAGES); n++) {
    const page = await pdf.getPage(n)
    const base = page.getViewport({ scale: 1 })
    const scale = Math.min(RENDER_SCALE, MAX_RENDER_PX / Math.max(base.width, base.height))
    const viewport = page.getViewport({ scale })
    const { canvas, context } = pdf.canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height))
    context.fillStyle = '#fff' // scans with transparency OCR badly on black
    context.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, canvasContext: context, viewport }).promise
    images.push(canvas.toBuffer('image/png'))
    page.cleanup()
  }
  return images
}

// ---------- entry point ----------

/**
 * @param {Buffer} bytes
 * @param {'application/pdf'|'image/jpeg'|'image/png'} mimeType
 * @returns {Promise<{ text: string, method: 'pdf-text'|'pdf-ocr'|'image-ocr'|'none', pages?: number, langs?: string, ms: number, error?: string }>}
 */
export async function extractText(bytes, mimeType) {
  const started = Date.now()
  const done = (result) => ({ ...result, ms: Date.now() - started })
  try {
    if (mimeType === 'application/pdf') {
      const { task, pdf } = await openPdf(bytes)
      try {
        const text = await pdfText(pdf)
        if (text.length >= MIN_PDF_CHARS) return done({ text, method: 'pdf-text', pages: pdf.numPages })
        // Scanned PDF: no (or almost no) text layer
        const images = await renderPages(pdf)
        const { text: ocrText, langs } = await ocr(images)
        return done({ text: ocrText.length > text.length ? ocrText : text, method: 'pdf-ocr', pages: images.length, langs })
      } finally {
        await task.destroy()
      }
    }
    const { text, langs } = await ocr([bytes])
    return done({ text, method: 'image-ocr', langs })
  } catch (err) {
    return done({ text: '', method: 'none', error: err.message ?? String(err) })
  }
}

/** Shuts the OCR worker down (tests; it otherwise lives as long as the server). */
export async function stopOcr() {
  const pending = workerPromise
  workerPromise = null
  if (pending) await (await pending.catch(() => null))?.worker.terminate()
}
