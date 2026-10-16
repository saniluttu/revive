import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { homePathFor, ROLES } from '../services/authService.js'
import useAuth from './useAuth.js'

/**
 * Route guard. Logged-out users go to /login; users with a different role go
 * to their own home. Patients must finish profile setup before anything else.
 */
export default function RequireRole({ role }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return null
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (user.role !== role) return <Navigate to={homePathFor(user)} replace />
  if (role === ROLES.PATIENT && !user.profile && location.pathname !== '/profile') {
    return <Navigate to="/profile" replace />
  }
  return <Outlet />
}
