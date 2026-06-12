import { useCallback, useRef, useState } from 'react'

/**
 * A short-lived, per-player UI event (e.g. "rolled a 6 — go again!").
 * `nonce` is monotonic so a repeat of the same event re-triggers its animation.
 */
export interface GameFlash {
  playerId: number
  nonce: number
}

/**
 * One self-clearing flash slot. `trigger` shows the flash and schedules its
 * removal; a newer trigger supersedes the pending clear, so rapid repeats
 * (back-to-back sixes) each get their full display time.
 */
export function useFlash() {
  const [flash, setFlash] = useState<GameFlash | null>(null)
  const nonceRef = useRef(0)

  const trigger = useCallback((playerId: number, ms: number) => {
    const nonce = ++nonceRef.current
    setFlash({ playerId, nonce })
    setTimeout(() => {
      setFlash((prev) => (prev?.nonce === nonce ? null : prev))
    }, ms)
  }, [])

  const clear = useCallback(() => setFlash(null), [])

  return { flash, trigger, clear }
}
