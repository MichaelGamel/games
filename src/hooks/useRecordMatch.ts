import { useEffect, useRef } from 'react'
import { recordMatch, type GameId } from '../lib/stats'

interface RecordablePlayer {
  id: number
  name: string
  /** Bots are excluded from the Hall of Fame. */
  isBot?: boolean
}

/**
 * Record the match into local stats exactly once when it ends. The guard ref
 * re-arms when the phase leaves `won` (Play Again / reset), so each finished
 * match counts once and only once.
 */
export function useRecordMatch(
  gameId: GameId,
  phase: string,
  players: ReadonlyArray<RecordablePlayer>,
  winnerId: number | null,
): void {
  const recordedRef = useRef(false)

  useEffect(() => {
    if (phase !== 'won') {
      recordedRef.current = false
      return
    }
    if (recordedRef.current || winnerId == null || players.length === 0) return
    recordedRef.current = true
    recordMatch(
      gameId,
      players
        .filter((p) => !p.isBot)
        .map((p) => ({ name: p.name, won: p.id === winnerId })),
    )
  }, [gameId, phase, players, winnerId])
}
