import { useLocation } from 'react-router-dom'
import { useWakeLock } from '../lib/useWakeLock'

/**
 * Keeps the screen awake on any game route (everything except the hub at `/`),
 * so the display never dims while a board is on screen. Route-based rather than
 * wired into each game's match state, so all six games are covered from one
 * place. Renders nothing.
 */
export function WakeLockManager() {
  const { pathname } = useLocation()
  useWakeLock(pathname !== '/')
  return null
}
