import { describe, expect, it } from 'vitest'
import { BODY_PART_IDS, EXERCISE_CATALOG } from '../../../server/src/report/exerciseCatalog.js'
import { BODY_PARTS, EXERCISES } from './library.js'

// The server tells the AI which exercises it may recommend; they must be ours.
describe('server exercise catalog', () => {
  it('matches the client exercise library', () => {
    expect(EXERCISE_CATALOG.map((e) => [e.id, e.bodyPart]).sort()).toEqual(EXERCISES.map((e) => [e.id, e.bodyPart]).sort())
  })

  it('uses the client body part ids', () => {
    expect([...BODY_PART_IDS].sort()).toEqual(BODY_PARTS.map((p) => p.id).sort())
  })
})
