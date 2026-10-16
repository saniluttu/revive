// Local extraction on real files. The first OCR run downloads the eng + mal
// language data into server/cache/tessdata (needs internet once).
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { cleanText, extractText, stopOcr } from '../src/report/extractText.js'
import { reportImage, scannedPdf, textPdf } from './helpers/fixtures.js'

after(stopOcr)

const expectReport = (text) => {
  assert.match(text, /MRI RIGHT KNEE/)
  assert.match(text, /osteoarthritis of the medial compartment/i)
  assert.match(text, /No meniscal tear/i)
}

test('PDF with a text layer → pdf-text, no OCR', async () => {
  const r = await extractText(textPdf(), 'application/pdf')
  assert.equal(r.method, 'pdf-text')
  expectReport(r.text)
})

test('scanned PDF (no text layer) → pages rendered and OCR’d', { timeout: 180_000 }, async () => {
  const r = await extractText(scannedPdf(), 'application/pdf')
  assert.equal(r.method, 'pdf-ocr')
  assert.equal(r.pages, 1)
  expectReport(r.text)
})

test('photo of a report → OCR with eng (+mal)', { timeout: 180_000 }, async () => {
  const r = await extractText(reportImage(), 'image/png')
  assert.equal(r.method, 'image-ocr')
  assert.match(r.langs, /eng/)
  expectReport(r.text)
})

test('unreadable file → empty text, method none, no throw', async () => {
  const r = await extractText(Buffer.from('%PDF-1.4 broken'), 'application/pdf')
  assert.equal(r.method, 'none')
  assert.equal(r.text, '')
  assert.ok(r.error)
})

test('cleanText collapses whitespace but keeps lines', () => {
  assert.equal(cleanText('  a   b \r\n\n\n\n c\t\td  '), 'a b\n\nc d')
})
