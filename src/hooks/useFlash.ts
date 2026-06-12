import { useCallback, useRef, useState } from 'react'

/**
 * A short-lived, per-player UI event (e.g. "rolled a 6 — go again!").
 * `nonce` is monotonic so a repeat of the same event re-triggers its animation.
 * `payload` optionally carries event details (e.g. which special cell fired).
 */
export interface GameFlash<TPayload = undefined> {
  playerId: number
  nonce: number
  payload: TPayload
}

/**
 * One self-clearing flash slot. `trigger` shows the flash and schedules its
 * removal; a newer trigger supersedes the pending clear, so rapid repeats
 * (back-to-back sixes) each get their full display time.
 */
export function useFlash<TPayload = undefined>() {
  const [flash, setFlash] = useState<GameFlash<TPayload> | null>(null)
  const nonceRef = useRef(0)

  const trigger = useCallback(
    (
      playerId: number,
      ms: number,
      // Payload-less flashes may omit the argument entirely.
      ...rest: TPayload extends undefined ? [payload?: TPayload] : [payload: TPayload]
    ) => {
      const payload = rest[0] as TPayload
      const nonce = ++nonceRef.current
      setFlash({ playerId, nonce, payload })
      setTimeout(() => {
        setFlash((prev) => (prev?.nonce === nonce ? null : prev))
      }, ms)
    },
    [],
  )

  const clear = useCallback(() => setFlash(null), [])

  return { flash, trigger, clear }
}
