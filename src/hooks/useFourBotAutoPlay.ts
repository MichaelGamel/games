/**
 * Drives the computer player in local Connect Four — mirrors `useBotAutoPlay`.
 * On a bot's idle turn, think briefly, then `drop` the column the pure bot
 * picks. `drop` re-guards its own preconditions, so a late timer is safe.
 */
import { useEffect } from 'react'
import { useReducedMotion } from 'motion/react'
import { TIMING } from '../four/config'
import { chooseFourMove } from '../four/bot'
import type { FourController } from './useConnectFour'

export function useFourBotAutoPlay(game: FourController): void {
  const reduced = useReducedMotion()
  const { phase, currentPlayerIndex, turnCount, drop, board } = game
  const currentIsBot = game.currentPlayer?.isBot ?? false
  const botLevel = game.currentPlayer?.botLevel ?? 'medium'

  useEffect(() => {
    if (phase !== 'idle' || !currentIsBot) return
    const column = chooseFourMove(board, currentPlayerIndex, (currentPlayerIndex + 1) % 2, botLevel)
    const timer = setTimeout(() => void drop(column), reduced ? 200 : TIMING.botThinkMs)
    return () => clearTimeout(timer)
    // `turnCount` re-arms the timer for the bot's next turn.
  }, [phase, currentPlayerIndex, turnCount, currentIsBot, botLevel, reduced, drop, board])
}
