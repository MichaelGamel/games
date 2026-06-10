/**
 * Owns the mute toggle and keeps the shared SoundEngine in sync with it.
 * Returns the singleton engine plus mute state so consumers fire effects
 * directly and the engine stays silent when muted.
 */
import { useCallback, useState } from 'react'
import { soundEngine } from '../audio/soundEngine'

export function useSound() {
  const [muted, setMuted] = useState(false)

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev
      soundEngine.setMuted(next)
      return next
    })
  }, [])

  return { sound: soundEngine, muted, toggleMute }
}
