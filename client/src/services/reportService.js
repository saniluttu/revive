// Report analysis (F3): sends the report file to the Express server, which asks
// the AI (see server/src/routes/report.js). The latest result is kept for this
// tab so the results page survives a refresh.

const API_BASE = import.meta.env.VITE_API_URL ?? ''
const RESULT_KEY = 'revive.reportAnalysis'

export const REPORT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
export const MAX_REPORT_BYTES = 10 * 1024 * 1024

/** Error with a `code` the UI maps to `report.errors.<code>`. */
class ReportError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

// The AI providers are sent PDFs, JPEGs and PNGs only, so other images become JPEG
const SENT_AS_IS = ['application/pdf', 'image/jpeg', 'image/png']

async function toJpeg(file) {
  try {
    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext('2d').drawImage(bitmap, 0, 0)
    bitmap.close()
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    if (!blob) throw new Error('encode failed')
    return blob
  } catch {
    throw new ReportError('read_failed')
  }
}

function readBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(new ReportError('read_failed'))
    reader.readAsDataURL(file)
  })
}

/**
 * @param {File} file PDF or image of the written report
 * @returns {Promise<{ analysis: object, provider: string, cached?: boolean, fileName: string }>}
 */
export async function analyzeReport(file) {
  if (!REPORT_TYPES.includes(file.type)) throw new ReportError('unsupported_file')
  if (file.size > MAX_REPORT_BYTES) throw new ReportError('file_too_large')

  const upload = SENT_AS_IS.includes(file.type) ? file : await toJpeg(file)
  const data = await readBase64(upload)
  let res
  try {
    res = await fetch(`${API_BASE}/api/report/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: { name: file.name, mimeType: upload.type, data } }),
    })
  } catch {
    throw new ReportError('network')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ReportError(body.error || 'unknown')

  const result = { analysis: body.analysis, provider: body.provider, cached: Boolean(body.cached), fileName: file.name }
  try {
    sessionStorage.setItem(RESULT_KEY, JSON.stringify(result))
  } catch {
    // storage blocked: the results page still gets it via navigation state
  }
  return result
}

export function lastReportResult() {
  try {
    return JSON.parse(sessionStorage.getItem(RESULT_KEY)) ?? null
  } catch {
    return null
  }
}
