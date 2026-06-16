import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUnloadGuard } from './useUnloadGuard'

/**
 * Guards a live match against being abandoned by accident. While `enabled` (a
 * match is in progress):
 *  - hard browser exits — refreshing, closing the tab/window, or navigating away
 *    from the site — trip the native "Leave site?" prompt (via
 *    {@link useUnloadGuard});
 *  - in-app exits — the browser Back button and the hub link — are intercepted
 *    and surfaced as a confirmation the caller renders (a
 *    {@link ConfirmLeaveDialog}); the real navigation only happens on confirm.
 *
 * The app mounts a plain `<BrowserRouter>` (not a data router), so React
 * Router's `useBlocker` isn't available. The Back button is caught instead with
 * a history sentinel + `popstate` listener, and the hub link routes through
 * `requestLeave`.
 *
 * @param enabled  Whether a match is currently in progress.
 * @param to       Where a confirmed leave navigates (defaults to the hub).
 */
export function useMatchExitGuard(enabled: boolean, to = '/') {
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  // Where a confirmed leave should go — set by whichever exit was attempted.
  const destination = useRef(to)

  // Refresh / tab close / window close / leaving the site.
  useUnloadGuard(enabled)

  // Browser Back button. We seed one extra history entry and, on every POP,
  // re-seed it so the page stays put while we ask. (useBlocker would need a data
  // router, which this app doesn't use.)
  useEffect(() => {
    if (!enabled) return
    window.history.pushState(null, '', window.location.href)
    const onPopState = () => {
      window.history.pushState(null, '', window.location.href)
      destination.current = to
      setConfirming(true)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [enabled, to])

  // In-app links (the hub link) call this to ask before leaving.
  const requestLeave = useCallback(
    (dest: string = to) => {
      destination.current = dest
      setConfirming(true)
    },
    [to],
  )

  const cancelLeave = useCallback(() => setConfirming(false), [])

  const confirmLeave = useCallback(() => {
    setConfirming(false)
    navigate(destination.current)
  }, [navigate])

  return { confirming, requestLeave, cancelLeave, confirmLeave }
}
