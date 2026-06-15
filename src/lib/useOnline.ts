import { useSyncExternalStore } from 'react'

const subscribe = (onChange: () => void) => {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/**
 * Live network reachability — re-renders on the browser's `online`/`offline`
 * events. Used to gate the online-multiplayer path (which needs a live Supabase
 * Realtime connection) while leaving all local pass-and-play untouched.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true, // assume online before hydration
  )
}
