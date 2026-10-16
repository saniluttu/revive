import { Navigate, Route, Routes } from 'react-router-dom'
import RequireRole from './auth/RequireRole.jsx'
import useAuth from './auth/useAuth.js'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Layout from './components/Layout.jsx'
import CaregiverDashboard from './pages/CaregiverDashboard.jsx'
import Chatbot from './pages/Chatbot.jsx'
import ExerciseSelect from './pages/ExerciseSelect.jsx'
import LiveSession from './pages/LiveSession.jsx'
import Login from './pages/Login.jsx'
import PatientHome from './pages/PatientHome.jsx'
import Prescription from './pages/Prescription.jsx'
import Profile from './pages/Profile.jsx'
import Progress from './pages/Progress.jsx'
import Reminders from './pages/Reminders.jsx'
import ReportResults from './pages/ReportResults.jsx'
import ReportUpload from './pages/ReportUpload.jsx'
import ReviewDetail from './pages/ReviewDetail.jsx'
import ReviewRequests from './pages/ReviewRequests.jsx'
import SessionSummary from './pages/SessionSummary.jsx'
import { homePathFor, ROLES } from './services/authService.js'

function HomeRedirect() {
  const { user, loading } = useAuth()
  if (loading) return null
  return <Navigate to={homePathFor(user)} replace />
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomeRedirect />} />
        <Route path="/login" element={<Login />} />

        <Route element={<RequireRole role={ROLES.PATIENT} />}>
          <Route path="/home" element={<PatientHome />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/report" element={<ReportUpload />} />
          <Route path="/report/results" element={<ReportResults />} />
          <Route path="/exercises" element={<ExerciseSelect />} />
          <Route path="/session" element={<LiveSession />} />
          <Route path="/summary" element={<SessionSummary />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/reminders" element={<Reminders />} />
          <Route path="/chat" element={<ErrorBoundary><Chatbot /></ErrorBoundary>} />
          <Route path="/prescription" element={<Prescription />} />
        </Route>

        <Route element={<RequireRole role={ROLES.CAREGIVER} />}>
          <Route path="/caregiver" element={<CaregiverDashboard />} />
        </Route>

        <Route element={<RequireRole role={ROLES.PHYSIO} />}>
          <Route path="/reviews" element={<ReviewRequests />} />
          <Route path="/reviews/:id" element={<ReviewDetail />} />
        </Route>

        <Route path="*" element={<HomeRedirect />} />
      </Route>
    </Routes>
  )
}
