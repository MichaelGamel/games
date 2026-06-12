/**
 * Drives computer-controlled players in local UNO "Pass & Play".
 *
 * A bot acts exactly like a human — the pure rules engine and reducer know
 * nothing about bots. The only extra behavior is here: on a bot's turn, wait a
 * short "thinking" beat then call the same controller actions a human would
 * ({@link chooseBotPlay} decides play/draw/challenge); and resolve the local
 * `choosing` pause a voluntary draw can open (a bot always plays a playable
 * drawn card). Every callback re-guards its own preconditions, so a late-firing
 * timer is always safe. Mirrors `useLudoBotAutoPlay`.
 *
 * Lives outside `useUno` so the orchestration facade stays generic and
 * online-safe — only local mode opts in by calling this hook.
 */
import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'
import { TIMING } from '../uno/config'
import { chooseBotPlay, mostCommonColor } from '../uno/bot'
import type { UnoController } from './useUno'

export { chooseBotPlay }

export function useUnoBotAutoPlay(game: UnoController): void {
  const reduced = useReducedMotion()
  const { phase, currentPlayerIndex, turnCount, choice } = game
  const currentIsBot = game.currentPlayer?.isBot ?? false

  // Keep the freshest controller without re-arming the timers every render
  // (the controller object is a new reference each render).
  const gameRef = useRef(game)
  useEffect(() => {
    gameRef.current = game
  })

  // Take the bot's turn: play / draw / challenge.
  useEffect(() => {
    if (phase !== 'idle' || !currentIsBot) return
    const thinkMs = reduced ? 200 : TIMING.botThinkMs
    const timer = setTimeout(() => {
      const g = gameRef.current
      const move = chooseBotPlay(g, g.currentPlayerIndex)
      if (move.type === 'play') {
        void g.play(move.cards, {
          chosenColor: move.chosenColor,
          sevenSwapTarget: move.sevenSwapTarget,
          declareUno: move.declareUno,
        })
      } else if (move.type === 'draw') {
        void g.drawCard()
      } else {
        void g.challenge()
      }
    }, thinkMs)
    return () => clearTimeout(timer)
    // `turnCount` re-arms for the bot's next turn (e.g. after its own draw).
  }, [phase, currentPlayerIndex, turnCount, currentIsBot, reduced])

  // Resolve a `choosing` pause on a bot's turn. Bots supply wild colors and
  // seven targets up front, so in practice this is the voluntary-draw offer.
  useEffect(() => {
    if (phase !== 'choosing' || !currentIsBot || !choice) return
    const timer = setTimeout(() => {
      const g = gameRef.current
      const hand = g.hands[g.currentPlayerIndex] ?? []
      if (choice.kind === 'drawn') void g.resolveDrawnCard(true, mostCommonColor(hand))
      else if (choice.kind === 'color') void g.chooseColor(mostCommonColor(hand))
      else void g.chooseSwapTarget((g.currentPlayerIndex + 1) % g.players.length)
    }, reduced ? 150 : TIMING.botThinkMs)
    return () => clearTimeout(timer)
  }, [phase, currentIsBot, choice, reduced])
}
