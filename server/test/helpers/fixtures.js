// Builds small report files for extraction tests: a PDF with a text layer, a
// scanned (image-only) PDF and a PNG photo of a report.
import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import { createRequire } from 'node:module'
import path from 'node:path'

// A font that ships with pdfjs-dist, so fixtures don't depend on system fonts
const require = createRequire(import.meta.url)
const fonts = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts')
GlobalFonts.registerFromPath(path.join(fonts, 'LiberationSans-Regular.ttf'), 'FixtureSans')

export const REPORT_LINES = [
  'MRI RIGHT KNEE',
  'IMPRESSION: Early osteoarthritis of the medial compartment.',
  'Mild joint effusion. No meniscal tear.',
]

function pdf(objects) {
  // objects: array of Buffers/strings for objects 1..n; builds xref + trailer
  const parts = [Buffer.from('%PDF-1.4\n')]
  const offsets = []
  let length = parts[0].length
  objects.forEach((body, i) => {
    offsets.push(length)
    const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), Buffer.from(body), Buffer.from('\nendobj\n')])
    parts.push(chunk)
    length += chunk.length
  })
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)].join('')
  parts.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`))
  return Buffer.concat(parts)
}

export function textPdf(lines = REPORT_LINES) {
  const stream = ['BT /F1 14 Tf 50 750 Td 18 TL', ...lines.map((l) => `(${l}) Tj T*`), 'ET'].join('\n')
  return pdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ])
}

export function reportImage(lines = REPORT_LINES, type = 'image/png') {
  const canvas = createCanvas(1700, 600)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#000'
  ctx.font = '44px FixtureSans'
  lines.forEach((l, i) => ctx.fillText(l, 60, 120 + i * 90))
  return canvas.toBuffer(type)
}

export function scannedPdf(lines = REPORT_LINES) {
  const jpeg = reportImage(lines, 'image/jpeg')
  const draw = 'q 612 0 0 216 0 576 cm /Im1 Do Q'
  return pdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> >> >>',
    `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`,
    Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width 1700 /Height 600 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),
      jpeg,
      Buffer.from('\nendstream'),
    ]),
  ])
}
