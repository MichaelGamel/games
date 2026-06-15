import { useEffect } from 'react'

/**
 * Hold a screen wake lock while `active` so the display doesn't dim mid-match.
 * The browser releases the lock whenever the tab is hidden, so we re-acquire on
 * `visibilitychange`. A no-op where the Wake Lock API is unsupported, and
 * silently tolerant if the request is refused (battery saver, no user gesture).
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return

    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async () => {
      try {
        sentinel = await navigator.wakeLock.request('screen')
      } catch {
        // Refused (permission / battery saver / not visible) — harmless.
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !cancelled) acquire()
    }

    acquire()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      sentinel?.release().catch(() => {})
      sentinel = null
    }
  }, [active])
}
