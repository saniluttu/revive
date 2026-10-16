import { describe, expect, it } from 'vitest'
import { currentStreak, painChange, perExercise, repsPerDay, summarize } from './progressStats.js'

const NOW = new Date(2026, 9, 16, 18, 0).getTime() // 16 Oct 2026, 6 pm local
const daysAgo = (n, hour = 9) => new Date(2026, 9, 16 - n, hour, 0).toISOString()
const session = (n, over = {}) => ({ date: daysAgo(n), exercise: 'mini-squat', reps: 10, quality: 70, wrongMoves: {}, painAfter: null, ...over })

describe('progress stats', () => {
  it('streak counts days in a row up to today, or up to yesterday if not done yet today', () => {
    expect(currentStreak([session(0), session(1), session(2), session(4)], NOW)).toBe(3)
    expect(currentStreak([session(1), session(2)], NOW)).toBe(2)
    expect(currentStreak([session(2)], NOW)).toBe(0)
    expect(currentStreak([], NOW)).toBe(0)
  })

  it('pain change compares the first and latest readings', () => {
    const list = [session(0, { painAfter: 2 }), session(1, { painAfter: 3 }), session(5, { painAfter: 6 }), session(6, { painAfter: 7 })]
    expect(painChange(list)).toEqual({ from: 7, to: 3, change: -4 }) // newest-first input
    expect(painChange([session(0, { painAfter: 4 })])).toBeNull()
  })

  it('reps per day fills days without a session with 0', () => {
    const days = repsPerDay([session(0, { reps: 5 }), session(0, { reps: 7, date: daysAgo(0, 15) }), session(2)], 4, NOW)
    expect(days.map((d) => d.reps)).toEqual([0, 10, 0, 12])
  })

  it('per-exercise breakdown with the most frequent mistake', () => {
    const rows = perExercise([
      session(0, { quality: 80, wrongMoves: { kneesIn: 1 } }),
      session(1, { quality: 60, wrongMoves: { kneesIn: 2, leanForward: 1 } }),
      session(2, { exercise: 'seated-knee-extension', reps: 8 }),
    ])
    expect(rows[0]).toEqual({ exercise: 'mini-squat', sessions: 2, reps: 20, quality: 70, topMistake: { id: 'kneesIn', count: 3 } })
    expect(rows[1].topMistake).toBeNull()
  })

  it('summary cards', () => {
    const s = summarize([session(0, { reps: 12 }), session(3), session(9)], NOW)
    expect(s).toMatchObject({ sessionsThisWeek: 2, totalReps: 32, avgQuality: 70, streak: 1, doneToday: true })
  })
})
