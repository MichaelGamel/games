/**
 * Drives the computer player in local Tic-Tac-Toe — mirrors `useFourBotAutoPlay`.
 * On a bot's idle turn, think briefly, then `place` the square the pure bot
 * picks. `place` re-guards its own preconditions, so a late timer is safe.
 */
import { useEffect } from 'react'
import { useReducedMotion } from 'motion/react'
import { TIMING } from '../xo/config'
import { chooseXOMove } from '../xo/bot'
import type { XOController } from './useTicTacToe'

export function useXOBotAutoPlay(game: XOController): void {
  const reduced = useReducedMotion()
  const { phase, currentPlayerIndex, turnCount, place, board } = game
  const currentIsBot = game.currentPlayer?.isBot ?? false

  useEffect(() => {
    if (phase !== 'idle' || !currentIsBot) return
    const [row, col] = chooseXOMove(board, currentPlayerIndex, (currentPlayerIndex + 1) % 2)
    const timer = setTimeout(() => void place(row, col), reduced ? 200 : TIMING.botThinkMs)
    return () => clearTimeout(timer)
    // `turnCount` re-arms the timer for the bot's next turn.
  }, [phase, currentPlayerIndex, turnCount, currentIsBot, reduced, place, board])
}
