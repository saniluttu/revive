import { describe, expect, it } from 'vitest'
import { buildPatientReport, reportFileName } from './patientReportPdf.js'

const session = (i) => ({
  id: `s${i}`,
  date: new Date(2026, 9, 2 + i, 9).toISOString(),
  exercise: i % 2 ? 'mini-squat' : 'seated-knee-extension',
  reps: 18,
  sets: 2,
  quality: 60 + i,
  wrongMoves: i < 3 ? { kneesIn: 2 } : {},
  painBefore: 6,
  painAfter: 5 - (i % 3),
})

describe('patient report PDF', () => {
  it('has the patient, findings, plan, notes and every session', async () => {
    const pdf = await buildPatientReport({
      patient: { name: 'Lakshmi', age: 68, gender: 'female' },
      report: { fileName: 'mri.pdf', createdAt: '2026-10-01T10:00:00Z', analysis: { diagnosis: 'Early knee OA', severity: 'mild', summary_en: 'Mild wear.', avoid: [{ en: 'Deep squats' }] } },
      plan: { exercises: [{ exerciseId: 'mini-squat', reps: 8, sets: 2 }], notes: 'Go slowly', reviewer: { name: 'Anitha Menon', registrationNumber: 'KL-1' }, updatedAt: '2026-10-02T10:00:00Z' },
      sessions: Array.from({ length: 40 }, (_, i) => session(i)).reverse(),
      generatedAt: new Date(2026, 10, 12, 12),
    })
    const raw = pdf.output()
    for (const s of ['Lakshmi', 'Early knee OA', 'Deep squats', 'Mini squat', 'Go slowly', 'Anitha Menon', 'Wrong movements', 'Page 1 of']) {
      expect(raw, s).toContain(s)
    }
    expect(pdf.getNumberOfPages()).toBeGreaterThan(1) // 40 sessions spill onto page 2
  })

  it('still works with no report, plan or sessions', async () => {
    const raw = (await buildPatientReport({ patient: { name: 'X' }, report: null, plan: null, sessions: [] })).output()
    expect(raw).toContain('No analysed report on file.')
    expect(raw).toContain('No exercise sessions recorded yet.')
  })

  it('file name', () => {
    expect(reportFileName('Lakshmi Amma', new Date('2026-10-16T08:00:00Z'))).toBe('revive-lakshmi-amma-2026-10-16.pdf')
    expect(reportFileName('ലക്ഷ്മി', new Date('2026-10-16T08:00:00Z'))).toBe('revive-patient-2026-10-16.pdf')
  })
})
