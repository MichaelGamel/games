/**
 * Drives computer-controlled players in local Bank El-Hazz "Pass & Play".
 *
 * A bot acts exactly like a human — the pure rules engine and reducer know
 * nothing about bots. The only extra behaviour is here: on a bot's idle turn,
 * wait a short "thinking" beat then call the same `roll()` a human would (a
 * jailed bot rolls for doubles to escape, just like a human tapping Roll); and
 * when a roll opens the buy/skip pause ({@link chooseBuyDecision} decides),
 * resolve it. Every callback re-guards its own preconditions, so a late-firing
 * timer is always safe. Mirrors `useUnoBotAutoPlay`.
 *
 * Lives outside `useBankElHazz` so the orchestration facade stays generic and
 * online-safe — only local mode opts in by calling this hook.
 */
import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'
import { TIMING } from '../bank/config'
import { chooseBuyDecision, type BotLevel } from '../bank/bot'
import type { BankController } from './useBankElHazz'

export { chooseBuyDecision }

export function useBankBotAutoPlay(game: BankController): void {
  const reduced = useReducedMotion()
  const { phase, currentPlayerIndex, turnCount, pendingBuy, pendingChoice } = game
  const currentIsBot = game.currentPlayer?.isBot ?? false

  // Keep the freshest controller without re-arming the timers every render
  // (the controller object is a new reference each render).
  const gameRef = useRef(game)
  useEffect(() => {
    gameRef.current = game
  })

  // Roll on a bot's idle turn (also rolls for doubles to escape jail).
  useEffect(() => {
    if (phase !== 'idle' || !currentIsBot) return
    const thinkMs = reduced ? 200 : TIMING.botThinkMs
    const timer = setTimeout(() => void gameRef.current.roll(), thinkMs)
    return () => clearTimeout(timer)
    // `turnCount` re-arms for the bot's next turn — including an extra turn from
    // doubles or completing a buy (same seat, idle again, turnCount bumped).
  }, [phase, currentPlayerIndex, turnCount, currentIsBot, reduced])

  // Resolve the buy/skip pause when the deciding seat is a bot.
  useEffect(() => {
    if (phase !== 'deciding' || !pendingBuy) return
    if (!gameRef.current.players[pendingBuy.seat]?.isBot) return
    const timer = setTimeout(() => {
      const g = gameRef.current
      const pb = g.pendingBuy
      if (!pb) return
      const level: BotLevel = g.players[pb.seat]?.botLevel ?? 'easy'
      if (chooseBuyDecision(g, pb.seat, pb.tile, pb.price, level) === 'buy') void g.decideBuy()
      else void g.decideDecline()
    }, reduced ? 150 : TIMING.botThinkMs)
    return () => clearTimeout(timer)
  }, [phase, pendingBuy, reduced])

  // Pick a deck when a bot lands on a "Luck or Court" cell. Deterministic (always
  // Luck) so the choice replays identically; the two decks are equivalent flavor.
  useEffect(() => {
    if (phase !== 'deciding' || !pendingChoice) return
    if (!gameRef.current.players[pendingChoice.seat]?.isBot) return
    const timer = setTimeout(() => {
      if (gameRef.current.pendingChoice) void gameRef.current.chooseCard('luck')
    }, reduced ? 150 : TIMING.botThinkMs)
    return () => clearTimeout(timer)
  }, [phase, pendingChoice, reduced])
}
