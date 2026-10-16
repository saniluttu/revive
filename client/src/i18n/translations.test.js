import { describe, expect, it } from 'vitest'
import { EXERCISES, BODY_PARTS } from '../exercises/library.js'
import { RULES } from '../exercises/rules.js'
import { PARTS } from '../exercises/body.js'
import { JOINTS } from '../pose/angles.js'
import en from './en.json'
import ml from './ml.json'

// Flatten to "a.b.c" keys; arrays count as one key whose length must match
function keys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v) ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  )
}
const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj)

describe('translations', () => {
  it('en and ml have the same keys', () => {
    expect(keys(ml).sort()).toEqual(keys(en).sort())
  })

  it('arrays have the same length in both languages', () => {
    for (const k of keys(en)) {
      if (Array.isArray(get(en, k))) expect(get(ml, k), k).toHaveLength(get(en, k).length)
    }
  })

  it('every exercise, body part, rule, part and joint has text', () => {
    for (const lang of [en, ml]) {
      for (const e of EXERCISES) {
        for (const f of ['name', 'setup', 'metricLabel', 'cues.start', 'cues.up', 'cues.top', 'cues.down', 'cues.partial']) {
          expect(get(lang, `exercises.${e.id}.${f}`), `${e.id}.${f}`).toBeTruthy()
        }
        expect(get(lang, `difficulty.${e.difficulty}`)).toBeTruthy()
      }
      for (const p of BODY_PARTS) expect(get(lang, `bodyParts.${p.id}.name`)).toBeTruthy()
      for (const id of Object.keys(RULES)) expect(get(lang, `rules.${id}`)).toBeTruthy()
      for (const p of PARTS) expect(get(lang, `parts.${p}`)).toBeTruthy()
      for (const j of JOINTS) expect(get(lang, `joints.${j.key}`)).toBeTruthy()
    }
  })

  it('placeholders match between languages', () => {
    const vars = (s) => [...String(s).matchAll(/{{(\w+)}}/g)].map((m) => m[1]).sort()
    for (const k of keys(en)) expect(vars(get(ml, k)), k).toEqual(vars(get(en, k)))
  })
})
