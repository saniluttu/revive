// Caregiver's "Download report (PDF)" for the doctor follow-up (F9): patient details,
// report findings, approved plan + physio notes, quality / reps charts and a session table.
// In English: jsPDF can't shape Malayalam script. Exercise and rule names come from en.json.

import en from '../i18n/en.json'
import { painChange, perExercise, repsPerDay, summarize } from '../components/progressStats.js'

const BRAND = [5, 150, 105]
const GREY = [100, 116, 139]
const INK = [15, 23, 42]
const exerciseName = (id) => en.exercises[id]?.name ?? id
const ruleName = (id) => en.rules[id] ?? id
const fmtDate = (iso) => (iso ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '—')
const fmtDay = (d) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(d))

/**
 * @param data { patient: { name, age, gender, email }, report, plan, sessions (newest first), generatedAt }
 * @returns {Promise<import('jspdf').jsPDF>}
 */
export async function buildPatientReport({ patient, report, plan, sessions, generatedAt = new Date() }) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  const M = 16
  let y = M

  const ensure = (needed) => {
    if (y + needed > H - M) {
      pdf.addPage()
      y = M
    }
  }
  const text = (str, { size = 11, color = INK, bold = false, indent = 0, gap = 1.5 } = {}) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal')
    pdf.setFontSize(size)
    pdf.setTextColor(...color)
    const lines = pdf.splitTextToSize(String(str), W - 2 * M - indent)
    const lineH = size * 0.42
    ensure(lines.length * lineH)
    pdf.text(lines, M + indent, y + lineH * 0.8)
    y += lines.length * lineH + gap
  }
  const heading = (str) => {
    ensure(16)
    y += 3
    text(str, { size: 14, bold: true, color: BRAND, gap: 1 })
    pdf.setDrawColor(...BRAND)
    pdf.line(M, y, W - M, y)
    y += 3
  }
  const row = (label, value) => {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.setTextColor(...GREY)
    ensure(6)
    pdf.text(label, M, y + 4)
    text(value ?? '—', { indent: 42 })
  }

  // ---- title
  text('Revive — Home physiotherapy report', { size: 18, bold: true, color: BRAND, gap: 1 })
  text(`Generated ${fmtDate(generatedAt)}`, { size: 10, color: GREY, gap: 4 })

  // ---- patient
  heading('Patient')
  row('Name', patient?.name)
  row('Age', patient?.age != null ? String(patient.age) : null)
  row('Gender', patient?.gender)

  // ---- report findings
  heading('Medical report findings')
  if (report?.analysis) {
    const a = report.analysis
    row('Report', `${report.fileName ?? ''}${report.createdAt ? ` (${fmtDate(report.createdAt)})` : ''}`)
    row('Diagnosis', a.diagnosis)
    row('Severity', a.severity)
    if (a.summary_en) row('Summary', a.summary_en)
    const cautions = [...(a.restrictions ?? []), ...(a.avoid ?? [])].map((c) => c.en ?? c).filter(Boolean)
    if (cautions.length) row('Be careful', cautions.join('; '))
  } else {
    text('No analysed report on file.', { color: GREY })
  }

  // ---- plan
  heading('Approved exercise plan')
  if (plan?.exercises?.length) {
    for (const p of plan.exercises) text(`•  ${exerciseName(p.exerciseId)} — ${p.reps} reps × ${p.sets} sets`, { indent: 2 })
    if (plan.reviewer) {
      const r = plan.reviewer
      text(`Approved by ${r.name}${r.registrationNumber ? ` (Reg. ${r.registrationNumber})` : ''}${r.clinic ? `, ${r.clinic}` : ''} on ${fmtDate(plan.updatedAt)}`, { size: 10, color: GREY })
    }
    if (plan.notes) row('Physio notes', plan.notes)
  } else {
    text('No plan approved by a physiotherapist yet.', { color: GREY })
  }

  // ---- summary + charts
  heading('Progress')
  if (!sessions.length) {
    text('No exercise sessions recorded yet.', { color: GREY })
  } else {
    const s = summarize(sessions, generatedAt.getTime())
    const pain = painChange(sessions)
    text(
      `Sessions this week: ${s.sessionsThisWeek}    Total reps: ${s.totalReps}    Average quality: ${s.avgQuality}/100    Streak: ${s.streak} day(s)` +
        (pain ? `    Pain after exercise: ${pain.from} to ${pain.to} (out of 10)` : ''),
      { gap: 4 },
    )

    // Quality trend (last 14 sessions) and reps per day (last 14 days), side by side
    const chartW = (W - 2 * M - 8) / 2
    const chartH = 42
    ensure(chartH + 14)
    const top = y + 6
    pdf.setFontSize(10)
    pdf.setTextColor(...INK)
    pdf.setFont('helvetica', 'bold')
    pdf.text('Quality per session (0–100)', M, y + 3)
    pdf.text('Reps per day (last 14 days)', M + chartW + 8, y + 3)
    pdf.setFont('helvetica', 'normal')

    const frame = (x0) => {
      pdf.setDrawColor(226, 232, 240)
      for (const f of [0, 0.5, 1]) pdf.line(x0, top + chartH * f, x0 + chartW, top + chartH * f)
    }
    frame(M)
    const trend = sessions.slice(0, 14).reverse()
    pdf.setDrawColor(...BRAND)
    pdf.setLineWidth(0.8)
    const px = (i) => M + (trend.length > 1 ? (i * chartW) / (trend.length - 1) : chartW / 2)
    const py = (q) => top + chartH - (q / 100) * chartH
    trend.forEach((t, i) => {
      if (i) pdf.line(px(i - 1), py(trend[i - 1].quality), px(i), py(t.quality))
      pdf.setFillColor(...BRAND)
      pdf.circle(px(i), py(t.quality), 0.9, 'F')
    })
    pdf.setLineWidth(0.2)

    const x1 = M + chartW + 8
    frame(x1)
    const days = repsPerDay(sessions, 14, generatedAt.getTime())
    const maxReps = Math.max(10, ...days.map((d) => d.reps))
    const slot = chartW / days.length
    pdf.setFillColor(...BRAND)
    days.forEach((d, i) => {
      if (!d.reps) return
      const h = (d.reps / maxReps) * chartH
      pdf.rect(x1 + i * slot + slot * 0.15, top + chartH - h, slot * 0.7, h, 'F')
    })
    pdf.setFontSize(8)
    pdf.setTextColor(...GREY)
    if (trend.length) {
      pdf.text(fmtDay(trend[0].date), M, top + chartH + 4)
      pdf.text(fmtDay(trend.at(-1).date), M + chartW, top + chartH + 4, { align: 'right' })
    }
    pdf.text(fmtDay(days[0].date), x1, top + chartH + 4)
    pdf.text(fmtDay(days.at(-1).date), x1 + chartW, top + chartH + 4, { align: 'right' })
    pdf.text(`max ${maxReps}`, x1 + chartW, top - 1, { align: 'right' })
    y = top + chartH + 8

    // Per exercise
    for (const r of perExercise(sessions)) {
      text(
        `${exerciseName(r.exercise)}: ${r.sessions} sessions, ${r.reps} reps, average quality ${r.quality}` +
          (r.topMistake ? ` — most often: ${ruleName(r.topMistake.id)} (${r.topMistake.count}×)` : ''),
        { size: 10, indent: 2 },
      )
    }

    // Session table
    heading('Sessions')
    const cols = [
      ['Date', 0],
      ['Exercise', 40],
      ['Reps', 92],
      ['Sets', 104],
      ['Quality', 116],
      ['Pain b/a', 134],
      ['Wrong movements', 152],
    ]
    const header = () => {
      ensure(8)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(9)
      pdf.setTextColor(...GREY)
      for (const [label, x] of cols) pdf.text(label, M + x, y + 4)
      y += 6
    }
    header()
    pdf.setFont('helvetica', 'normal')
    for (const s of sessions) {
      const moves = Object.entries(s.wrongMoves ?? {}).map(([id, n]) => `${ruleName(id).split(' —')[0]} ×${n}`).join(', ') || '—'
      const moveLines = pdf.splitTextToSize(moves, W - 2 * M - 152)
      const h = Math.max(1, moveLines.length) * 4 + 2
      if (y + h > H - M) {
        pdf.addPage()
        y = M
        header()
        pdf.setFont('helvetica', 'normal')
      }
      pdf.setFontSize(9)
      pdf.setTextColor(...INK)
      const cells = [
        fmtDate(s.date),
        exerciseName(s.exercise),
        String(s.reps),
        String(s.sets),
        String(s.quality),
        s.painBefore != null || s.painAfter != null ? `${s.painBefore ?? '–'} / ${s.painAfter ?? '–'}` : '—',
      ]
      cells.forEach((c, i) => pdf.text(pdf.splitTextToSize(c, (cols[i + 1]?.[1] ?? 150) - cols[i][1] - 2)[0], M + cols[i][1], y + 4))
      pdf.text(moveLines, M + 152, y + 4)
      y += h
    }
  }

  // ---- footer on every page
  const pages = pdf.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i)
    pdf.setFontSize(8)
    pdf.setTextColor(...GREY)
    pdf.text('Generated by Revive. General exercise guidance — not a medical diagnosis.', M, H - 8)
    pdf.text(`Page ${i} of ${pages}`, W - M, H - 8, { align: 'right' })
  }
  return pdf
}

/** File name like revive-lakshmi-2026-10-16.pdf */
export function reportFileName(name, date = new Date()) {
  const slug = String(name || 'patient').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'patient'
  return `revive-${slug}-${date.toISOString().slice(0, 10)}.pdf`
}
