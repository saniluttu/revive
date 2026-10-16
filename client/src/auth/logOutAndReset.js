import { logOut } from '../services/authService.js'
import { forgetReportResult } from '../services/reportService.js'

/**
 * Logs out and reloads on the login page, so nothing of the previous user —
 * live listeners, cached reviews, the last report, voice history — survives
 * in memory for whoever uses this device next.
 */
export default async function logOutAndReset() {
  try {
    await logOut()
  } finally {
    forgetReportResult()
    window.location.replace('/login')
  }
}
