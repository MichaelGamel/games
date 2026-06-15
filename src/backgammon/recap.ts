/**
 * Pure match-recap statistics for Backgammon, distilled from a {@link MatchLog}.
 * No React, no DOM — unit-tested in `recap.test.ts`. Mirrors `ludo/recap.ts`.
 */
import { OFF } from './config'
import type { MatchLog } from '../lib/matchLog'
import type { BackgammonRules, BackgammonTurnResolution } from './types'

export interface BackgammonPlayerRecap {
  name: string
  color: string
  rolls: number
  /** Rolls that came up doubles. */
  doubles: number
  /** Opponent checkers this seat sent to the bar. */
  hits: number
  /** This seat's checkers that were sent to the bar. */
  timesHit: number
  /** Checkers this seat bore off. */
  borneOff: number
}

export interface BackgammonRecap {
  totalTurns: number
  players: BackgammonPlayerRecap[]
}

export function summarizeBackgammon(
  log: MatchLog<BackgammonTurnResolution, BackgammonRules>,
): BackgammonRecap {
  const players: BackgammonPlayerRecap[] = log.players.map((p) => ({
    name: p.name,
    color: p.color,
    rolls: 0,
    doubles: 0,
    hits: 0,
    timesHit: 0,
    borneOff: 0,
  }))

  let totalTurns = 0
  for (const event of log.events) {
    if (event.kind !== 'turn') continue
    totalTurns++
    const stats = players[event.seat]
    if (!stats) continue
    const r = event.resolution
    stats.rolls++
    if (r.dice.length === 2 && r.dice[0] === r.dice[1]) stats.doubles++
    for (const move of r.moves) {
      if (move.to === OFF) stats.borneOff++
      if (move.hit) {
        stats.hits++
        const victim = players[1 - event.seat]
        if (victim) victim.timesHit++
      }
    }
  }

  return { totalTurns, players }
}
