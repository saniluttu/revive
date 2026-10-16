import { useSyncExternalStore } from 'react'
import { getAuthState, onAuthStateChanged } from '../services/authService.js'

/** Live auth state: `{ user, loading }`. Re-renders on login, logout and profile changes. */
export default function useAuth() {
  return useSyncExternalStore(onAuthStateChanged, getAuthState, getAuthState)
}
