import { useEffect } from 'react'

/**
 * Roll on Space / Enter while `enabled`, unless focus is on an interactive
 * control (so keyboard users can still operate buttons and inputs normally).
 * Shared by every game screen; no listener is attached while rolling is
 * disallowed.
 */
export function useRollHotkey(enabled: boolean, onRoll: () => void): void {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return
      if (e.repeat) return
      const target = e.target as HTMLElement | null
      if (target?.closest('button, input, textarea, a, [role="button"]')) return
      e.preventDefault()
      onRoll()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, onRoll])
}
