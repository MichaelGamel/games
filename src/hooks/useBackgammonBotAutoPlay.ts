/**
 * Drives the computer player in local Backgammon — mirrors `useFourBotAutoPlay`.
 * On a bot's idle turn it rolls; once the roll pauses in `selecting`, it picks a
 * move sequence and plays it (animated). Both `roll` and `botPlay` re-guard their
 * own preconditions, so a late timer is safe.
 */
import { useEffect } from 'react'
import { useReducedMotion } from 'motion/react'
import { TIMING } from '../backgammon/config'
import { chooseBotSequence } from '../backgammon/bot'
import type { BackgammonController } from './useBackgammon'

export function useBackgammonBotAutoPlay(game: BackgammonController): void {
  const reduced = useReducedMotion()
  const { phase, currentPlayerIndex, turnCount, roll, botPlay, lastDice } = game
  const current = game.currentPlayer
  const currentIsBot = current?.isBot ?? false
  const level = current?.botLevel ?? 'smart'

  // Roll on the bot's idle turn.
  useEffect(() => {
    if (phase !== 'idle' || !currentIsBot) return
    const timer = setTimeout(() => void roll(), reduced ? 200 : TIMING.botThinkMs)
    return () => clearTimeout(timer)
    // `turnCount` re-arms the timer for the bot's next turn.
  }, [phase, currentPlayerIndex, turnCount, currentIsBot, reduced, roll])

  // Build + play once the roll pauses for a choice.
  useEffect(() => {
    if (phase !== 'selecting' || !currentIsBot) return
    const moves = chooseBotSequence(game, currentPlayerIndex, lastDice, level)
    const timer = setTimeout(() => void botPlay(moves), reduced ? 200 : TIMING.botThinkMs)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `game` is stable enough; re-arm on turn/phase.
  }, [phase, currentPlayerIndex, turnCount, currentIsBot, level, reduced, botPlay])
}
