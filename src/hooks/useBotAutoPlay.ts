/**
 * Drives computer-controlled players in local "Pass & Play".
 *
 * A bot rolls exactly like a human — the pure rules engine and the reducer know
 * nothing about bots. The only extra behavior is here: when it's a bot's turn
 * and the game is idle, wait a short "thinking" beat and then call the same
 * `roll()` a human would. Because `roll()` re-guards its own preconditions
 * (idle phase, not already rolling, nothing queued), a late-firing timer is
 * always safe.
 *
 * This lives outside `useSnakesAndLadders` so the orchestration facade stays
 * generic and online-safe — only local mode opts in by calling this hook.
 */
import { useEffect } from 'react'
import { useReducedMotion } from 'motion/react'
import { TIMING } from '../game/config'
import type { GameController } from './useSnakesAndLadders'

export function useBotAutoPlay(game: GameController): void {
  const reduced = useReducedMotion()
  const { phase, currentPlayerIndex, turnCount, roll } = game
  const currentIsBot = game.currentPlayer?.isBot ?? false

  useEffect(() => {
    if (phase !== 'idle' || !currentIsBot) return
    const thinkMs = reduced ? 200 : TIMING.botThinkMs
    const timer = setTimeout(() => void roll(), thinkMs)
    return () => clearTimeout(timer)
    // `turnCount` re-arms the timer for the bot's next turn — including an extra
    // turn from rolling a 6 (same player, idle again, turnCount incremented).
  }, [phase, currentPlayerIndex, turnCount, currentIsBot, reduced, roll])
}
