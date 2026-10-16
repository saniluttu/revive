// Patient voice questions (F10): prompt + reply validation for the physio assistant.
// Scope is the patient's exercises only; red-flag symptoms are caught before the AI
// (see voice/redFlags.js) and the model is told to flag any it notices too.

import { EXERCISE_CATALOG } from '../report/exerciseCatalog.js'

export const MAX_QUESTION_CHARS = 1000
const MAX_REPLY_CHARS = 1200
const MAX_HISTORY = 6

const byId = new Map(EXERCISE_CATALOG.map((e) => [e.id, e]))

const LANGUAGE_NAME = { ml: 'Malayalam (Malayalam script)', en: 'simple English' }

function describeExercise(id) {
  const e = byId.get(id)
  return e ? `${e.id} — ${e.description}` : null
}

/**
 * @param {{ lang: 'ml'|'en', exerciseId?: string|null, plan?: {exerciseId:string, reps:number, sets:number}[] }} ctx
 */
export function systemPrompt({ lang, exerciseId, plan }) {
  const current = exerciseId ? describeExercise(exerciseId) : null
  const planLines = (plan ?? [])
    .map((p) => {
      const d = describeExercise(p.exerciseId)
      return d && `- ${d} Dose: ${p.reps} reps × ${p.sets} sets.`
    })
    .filter(Boolean)
  return [
    'You are Revive, a friendly home-physiotherapy assistant for an elderly patient in Kerala.',
    'Answer ONLY questions about their physiotherapy exercises: how to do them, form, reps and sets, rest, mild soreness, and using the Revive app.',
    'For anything else (medicines, diagnosis, other medical topics, general chat) say kindly that you can only help with their exercises and they should ask their doctor or physiotherapist.',
    'Never change the plan their physiotherapist approved — no extra exercises, reps or sets beyond it. Never diagnose.',
    'RED FLAGS: if the patient mentions chest pain, severe or worsening pain, numbness, tingling, swelling, a fall, dizziness, fainting, breathlessness or bleeding, set "redFlag": true.',
    `Reply in ${LANGUAGE_NAME[lang] ?? LANGUAGE_NAME.en}, in 1–3 short sentences that sound natural when read aloud. No lists, no markdown, no emoji.`,
    current ? `The patient is doing this exercise right now: ${current}` : 'The patient is not in an exercise session right now.',
    planLines.length
      ? `Their physiotherapist-approved plan:\n${planLines.join('\n')}`
      : 'They have no approved exercise plan yet.',
    'Respond with ONLY a JSON object: {"reply": "<your answer>", "redFlag": <true|false>}',
  ].join('\n')
}

/** Last few turns, as the router's message list. */
export function toMessages(history, question) {
  const turns = (Array.isArray(history) ? history : [])
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_QUESTION_CHARS) }))
  return [...turns, { role: 'user', content: question }]
}

/** Validates the model's JSON reply. Throws on anything unusable. */
export function parseReply(text) {
  const match = String(text).match(/\{[\s\S]*\}/)
  if (!match) throw new Error('no JSON object')
  const data = JSON.parse(match[0])
  const reply = typeof data.reply === 'string' ? data.reply.trim() : ''
  const redFlag = data.redFlag === true || data.redFlag === 'true'
  if (!reply && !redFlag) throw new Error('empty "reply"')
  return { reply: reply.slice(0, MAX_REPLY_CHARS), redFlag }
}
