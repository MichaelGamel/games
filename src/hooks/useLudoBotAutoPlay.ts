/**
 * Drives computer-controlled players in local Ludo "Pass & Play".
 *
 * A bot acts exactly like a human — the pure rules engine and reducer know
 * nothing about bots. The only extra behavior is here: on a bot's turn, wait a
 * short "thinking" beat then call the same `roll()` a human would; and when a
 * roll leaves more than one legal move (the `selecting` pause), pick one with a
 * simple deterministic heuristic and call `selectToken()`. Both re-guard their
 * own preconditions, so a late-firing timer is always safe.
 *
 * Lives outside `useLudo` so the orchestration facade stays generic and
 * online-safe — only local mode opts in by calling this hook.
 */
import { useEffect } from 'react'
import { useReducedMotion } from 'motion/react'
import { TIMING } from '../ludo/config'
import { chooseBotMove } from '../ludo/bot'
import type { LudoController } from './useLudo'

export { chooseBotMove }

export function useLudoBotAutoPlay(game: LudoController): void {
  const reduced = useReducedMotion()
  const { phase, currentPlayerIndex, turnCount, roll, selectToken, selectableMoves } = game
  const currentIsBot = game.currentPlayer?.isBot ?? false

  // Roll on a bot's turn.
  useEffect(() => {
    if (phase !== 'idle' || !currentIsBot) return
    const thinkMs = reduced ? 200 : TIMING.botThinkMs
    const timer = setTimeout(() => void roll(), thinkMs)
    return () => clearTimeout(timer)
    // `turnCount` re-arms the timer for the bot's next turn — including an extra
    // turn from a six or a capture (same seat, idle again, turnCount bumped).
  }, [phase, currentPlayerIndex, turnCount, currentIsBot, reduced, roll])

  // Resolve the selection pause when a bot's roll left more than one option.
  const botLevel = game.currentPlayer?.botLevel ?? 'easy'
  useEffect(() => {
    if (phase !== 'selecting' || !currentIsBot || selectableMoves.length === 0) return
    const timer = setTimeout(() => {
      // Re-read the live state at fire time for the smart bot's threat map.
      const choice = chooseBotMove(selectableMoves, {
        state: game,
        seat: game.currentPlayerIndex,
        level: botLevel,
      })
      void selectToken(choice.tokenId)
    }, reduced ? 150 : TIMING.botThinkMs)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentIsBot, selectableMoves, reduced, selectToken, botLevel])
}
