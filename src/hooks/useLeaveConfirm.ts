import { useCallback, useState } from 'react'

/**
 * Two-step "leave the match" gate. `requestLeave` opens a confirmation; the
 * real `onLeave` only fires once the player confirms. Lets an online room route
 * its Leave button through {@link ConfirmLeaveDialog} so an accidental tap
 * (kids do this mid-game) never abandons a running match.
 */
export function useLeaveConfirm(onLeave: () => void) {
  const [confirming, setConfirming] = useState(false)

  const requestLeave = useCallback(() => setConfirming(true), [])
  const cancelLeave = useCallback(() => setConfirming(false), [])
  const confirmLeave = useCallback(() => {
    setConfirming(false)
    onLeave()
  }, [onLeave])

  return { confirming, requestLeave, cancelLeave, confirmLeave }
}
