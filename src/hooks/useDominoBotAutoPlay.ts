/**
 * Drives computer-controlled players in local Dominoes "Pass & Play".
 *
 * A bot acts exactly like a human — the pure rules engine and reducer know
 * nothing about bots. The only extra behavior is here: on a bot's turn, wait a
 * short "thinking" beat then call the same controller actions a human would
 * ({@link chooseDominoMove} decides play vs. draw/pass). Every callback re-guards
 * its own preconditions, so a late-firing timer is always safe. Mirrors
 * `useUnoBotAutoPlay`.
 *
 * Lives outside `useDomino` so the orchestration facade stays generic and
 * online-safe — only local mode opts in by calling this hook.
 */
import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'
import { TIMING } from '../domino/config'
import { chooseDominoMove } from '../domino/bot'
import type { DominoController } from './useDomino'

export { chooseDominoMove }

export function useDominoBotAutoPlay(game: DominoController): void {
  const reduced = useReducedMotion()
  const { phase, currentPlayerIndex, turnCount, choice } = game
  const currentIsBot = game.currentPlayer?.isBot ?? false

  // Keep the freshest controller without re-arming the timers every render.
  const gameRef = useRef(game)
  useEffect(() => {
    gameRef.current = game
  })

  // Take the bot's turn: play a tile, or draw-until-playable / pass.
  useEffect(() => {
    if (phase !== 'idle' || !currentIsBot) return
    const thinkMs = reduced ? 200 : TIMING.botThinkMs
    const timer = setTimeout(() => {
      const g = gameRef.current
      const move = chooseDominoMove(g, g.currentPlayerIndex)
      if (move.type === 'play') void g.play(move.tileId, move.end)
      else void g.drawOrPass()
    }, thinkMs)
    return () => clearTimeout(timer)
    // `turnCount` re-arms for the bot's next turn.
  }, [phase, currentPlayerIndex, turnCount, currentIsBot, reduced])

  // Defensive: a bot always supplies its end up front, so it should never open
  // the end-choice pause — but resolve it just in case.
  useEffect(() => {
    if (phase !== 'choosing' || !currentIsBot || !choice) return
    const timer = setTimeout(
      () => {
        void gameRef.current.chooseEnd(choice.ends[0])
      },
      reduced ? 150 : TIMING.botThinkMs,
    )
    return () => clearTimeout(timer)
  }, [phase, currentIsBot, choice, reduced])
}
