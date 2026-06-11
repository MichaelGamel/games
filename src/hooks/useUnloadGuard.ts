import { useEffect } from 'react'

/**
 * Warn before the page goes away while `enabled` is true, so an in-progress
 * game isn't lost by accident — closing the tab/window, refreshing, or a
 * back-navigation that leaves the app all trip the browser's native "Leave
 * site?" confirmation.
 *
 * The prompt's wording is controlled by the browser, not us: modern browsers
 * ignore any custom string. Calling `preventDefault()` (and, for older
 * browsers, setting `returnValue`) is what actually arms the dialog.
 */
export function useUnloadGuard(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Legacy browsers only show the prompt if `returnValue` is set. The
      // property is deprecated in the lib types (preventDefault supersedes it),
      // so assign it through a cast to keep the fallback without the warning.
      ;(e as unknown as { returnValue: string }).returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [enabled])
}
