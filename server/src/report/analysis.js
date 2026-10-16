// Prompt and strict validation for MRI report analysis (REQUIREMENTS §4 F3).

import { BODY_PART_IDS, EXERCISE_CATALOG, EXERCISE_IDS } from './exerciseCatalog.js'

export const SEVERITIES = ['mild', 'moderate', 'severe', 'unknown']

const library = EXERCISE_CATALOG.map(
  (e) => `- "${e.id}" (${e.bodyPart}): ${e.description} Suits: ${e.suits}.`,
).join('\n')

export const SYSTEM_PROMPT = `You are a physiotherapy assistant for Revive, a home rehab app for elderly patients in Kerala.
You read the WRITTEN radiology report (text in a PDF or photo). Do not interpret raw scan images.

Our exercise library has exactly these exercises:
${library}

Reply with ONLY a JSON object, no markdown, with exactly these keys:
{
  "diagnosis": string,                      // main findings in plain English, one line
  "affected_body_parts": string[],          // from: ${BODY_PART_IDS.map((b) => `"${b}"`).join(', ')}
  "severity": "mild" | "moderate" | "severe" | "unknown",
  "restrictions": [{ "en": string, "ml": string }],   // movements/activities to be careful with
  "recommended_exercise_ids": string[],     // ONLY ids from the library above; [] if none is safe
  "avoid": [{ "en": string, "ml": string }],          // exercises or movements to avoid, and why (short)
  "reason": { "en": string, "ml": string },           // why these exercises were chosen
  "summary_en": string,                     // 2–4 short sentences for an elderly patient, simple English
  "summary_ml": string                      // the same summary in simple Malayalam (Malayalam script)
}

Rules:
- Only recommend library exercises that are safe for the findings. If a library exercise is unsafe
  (e.g. weight-bearing squats with a severe/acute knee injury), leave it out and list it in "avoid".
- Use simple words, no jargon in summaries. Never give medication advice.
- If the document is not a medical report, set diagnosis to "Not a medical report", severity "unknown",
  and return empty arrays.`

export const USER_PROMPT = 'Here is my medical report. Analyse it and reply with the JSON object.'

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v)
const str = (v) => (typeof v === 'string' ? v.trim() : '')

// Accepts "text" or { en, ml }; returns { en, ml } (missing language falls back to the other)
function bilingual(v) {
  if (typeof v === 'string') return v.trim() ? { en: v.trim(), ml: v.trim() } : null
  if (!isObj(v)) return null
  const en = str(v.en)
  const ml = str(v.ml)
  if (!en && !ml) return null
  return { en: en || ml, ml: ml || en }
}

const bilingualList = (v) => (Array.isArray(v) ? v.map(bilingual).filter(Boolean) : [])

function extractJson(text) {
  const s = String(text).trim()
  try {
    return JSON.parse(s)
  } catch {
    // tolerate ```json fences or a sentence around the object
    const start = s.indexOf('{')
    const end = s.lastIndexOf('}')
    if (start === -1 || end <= start) throw new Error('no JSON object in reply')
    return JSON.parse(s.slice(start, end + 1))
  }
}

/**
 * Parses and validates an LLM reply. Throws if it is unusable; otherwise
 * returns a clean object with only known body parts and library exercise IDs.
 */
export function parseAnalysis(text) {
  const raw = extractJson(text)
  if (!isObj(raw)) throw new Error('reply is not a JSON object')

  const diagnosis = str(raw.diagnosis)
  const summary_en = str(raw.summary_en)
  const summary_ml = str(raw.summary_ml)
  if (!diagnosis) throw new Error('missing diagnosis')
  if (!summary_en && !summary_ml) throw new Error('missing summary')

  const parts = Array.isArray(raw.affected_body_parts) ? raw.affected_body_parts : []
  const affected_body_parts = [
    ...new Set(
      parts
        .map((p) => str(p).toLowerCase().replace(/[\s_]+/g, '-'))
        .map((p) => (p === 'back' || p === 'lumbar' ? 'lower-back' : p))
        .filter((p) => BODY_PART_IDS.includes(p)),
    ),
  ]

  const ids = Array.isArray(raw.recommended_exercise_ids) ? raw.recommended_exercise_ids : []
  const recommended_exercise_ids = [...new Set(ids.map(str).filter((id) => EXERCISE_IDS.includes(id)))]

  const severity = SEVERITIES.includes(str(raw.severity).toLowerCase()) ? str(raw.severity).toLowerCase() : 'unknown'

  return {
    diagnosis,
    affected_body_parts,
    severity,
    restrictions: bilingualList(raw.restrictions),
    recommended_exercise_ids,
    avoid: bilingualList(raw.avoid),
    reason: bilingual(raw.reason) ?? { en: '', ml: '' },
    summary_en: summary_en || summary_ml,
    summary_ml: summary_ml || summary_en,
  }
}
