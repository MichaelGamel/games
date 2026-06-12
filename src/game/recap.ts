/**
 * Pure match-recap statistics for Snakes & Ladders, distilled from a
 * {@link MatchLog}. No React, no DOM — unit-tested in `recap.test.ts`.
 */
import type { MatchLog } from '../lib/matchLog'
import type { SnakesRules, TurnResolution } from './types'

export interface SnakesPlayerRecap {
  name: string
  color: string
  rolls: number
  /** Sixes with one die; doubles with two. */
  luckyRolls: number
  laddersClimbed: number
  snakesHit: number
  /** Largest single climb (cells gained by one ladder). */
  biggestClimb: number
  /** Largest single slide (cells lost to one snake). */
  biggestSlide: number
  bounces: number
  /** Special cells triggered (shield/swap/mystery + shields spent). */
  specials: number
}

export interface SnakesRecap {
  totalTurns: number
  players: SnakesPlayerRecap[]
}

export function summarizeSnakes(log: MatchLog<TurnResolution, SnakesRules>): SnakesRecap {
  const players: SnakesPlayerRecap[] = log.players.map((p) => ({
    name: p.name,
    color: p.color,
    rolls: 0,
    luckyRolls: 0,
    laddersClimbed: 0,
    snakesHit: 0,
    biggestClimb: 0,
    biggestSlide: 0,
    bounces: 0,
    specials: 0,
  }))

  let totalTurns = 0
  for (const event of log.events) {
    if (event.kind !== 'turn') continue
    totalTurns++
    const stats = players[event.seat]
    if (!stats) continue
    const r = event.resolution
    stats.rolls++
    if (r.dice.length === 1 ? r.dice[0] === 6 : r.dice[0] === r.dice[1]) stats.luckyRolls++
    if (r.bounced) stats.bounces++
    if (r.jump?.kind === 'ladder') {
      stats.laddersClimbed++
      stats.biggestClimb = Math.max(stats.biggestClimb, r.jump.to - r.jump.from)
    }
    if (r.jump?.kind === 'snake') {
      stats.snakesHit++
      stats.biggestSlide = Math.max(stats.biggestSlide, r.jump.from - r.jump.to)
    }
    if (r.special != null || r.shieldUsed) stats.specials++
  }

  return { totalTurns, players }
}
