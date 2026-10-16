import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Profile from './pages/Profile.jsx'
import ReportUpload from './pages/ReportUpload.jsx'
import ExerciseSelect from './pages/ExerciseSelect.jsx'
import LiveSession from './pages/LiveSession.jsx'
import SessionSummary from './pages/SessionSummary.jsx'
import Progress from './pages/Progress.jsx'
import Reminders from './pages/Reminders.jsx'
import CaregiverDashboard from './pages/CaregiverDashboard.jsx'
import Chatbot from './pages/Chatbot.jsx'
import Prescription from './pages/Prescription.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/report" element={<ReportUpload />} />
        <Route path="/exercises" element={<ExerciseSelect />} />
        <Route path="/session" element={<LiveSession />} />
        <Route path="/summary" element={<SessionSummary />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/reminders" element={<Reminders />} />
        <Route path="/caregiver" element={<CaregiverDashboard />} />
        <Route path="/chat" element={<Chatbot />} />
        <Route path="/prescription" element={<Prescription />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Route>
    </Routes>
  )
}
