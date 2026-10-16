import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseAnalysis } from '../src/report/analysis.js'

const good = {
  diagnosis: 'Early knee osteoarthritis; adhesive capsulitis of the left shoulder',
  affected_body_parts: ['Knee', 'shoulder', 'elbow'],
  severity: 'Moderate',
  restrictions: [{ en: 'No deep squats', ml: 'ആഴത്തിൽ കുനിയരുത്' }, 'Avoid heavy lifting', 42],
  recommended_exercise_ids: ['seated-knee-extension', 'shoulder-abduction', 'jumping-jacks', 'shoulder-abduction'],
  avoid: [{ en: 'Running' }],
  reason: 'Gentle range of motion',
  summary_en: 'Your knee shows early wear.',
  summary_ml: 'മുട്ടിന് ചെറിയ തേയ്മാനം ഉണ്ട്.',
}

test('keeps only library exercise ids and known body parts', () => {
  const a = parseAnalysis(JSON.stringify(good))
  assert.deepEqual(a.recommended_exercise_ids, ['seated-knee-extension', 'shoulder-abduction'])
  assert.deepEqual(a.affected_body_parts, ['knee', 'shoulder'])
  assert.equal(a.severity, 'moderate')
})

test('normalises text fields to { en, ml }', () => {
  const a = parseAnalysis(JSON.stringify(good))
  assert.deepEqual(a.restrictions, [
    { en: 'No deep squats', ml: 'ആഴത്തിൽ കുനിയരുത്' },
    { en: 'Avoid heavy lifting', ml: 'Avoid heavy lifting' },
  ])
  assert.deepEqual(a.avoid, [{ en: 'Running', ml: 'Running' }])
  assert.deepEqual(a.reason, { en: 'Gentle range of motion', ml: 'Gentle range of motion' })
})

test('accepts JSON wrapped in a markdown fence', () => {
  const a = parseAnalysis('```json\n' + JSON.stringify(good) + '\n```')
  assert.equal(a.diagnosis, good.diagnosis)
})

test('unknown severity becomes "unknown"', () => {
  assert.equal(parseAnalysis(JSON.stringify({ ...good, severity: 'very bad' })).severity, 'unknown')
})

test('rejects replies without JSON, diagnosis or summary', () => {
  assert.throws(() => parseAnalysis('Sorry, I cannot help.'))
  assert.throws(() => parseAnalysis(JSON.stringify({ ...good, diagnosis: '' })))
  assert.throws(() => parseAnalysis(JSON.stringify({ ...good, summary_en: '', summary_ml: '' })))
  assert.throws(() => parseAnalysis('[1,2]'))
})
