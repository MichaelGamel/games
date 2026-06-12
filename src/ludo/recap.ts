/**
 * Pure match-recap statistics for Ludo, distilled from a {@link MatchLog}.
 * No React, no DOM — unit-tested in `recap.test.ts`.
 */
import type { MatchLog } from '../lib/matchLog'
import type { LudoRules, LudoTurnResolution } from './types'

export interface LudoPlayerRecap {
  name: string
  color: string
  rolls: number
  /** Sixes with one die; doubles with two. */
  luckyRolls: number
  /** Rival tokens this seat sent back to base. */
  captures: number
  /** This seat's tokens that were sent back to base. */
  timesCaptured: number
  releases: number
  homeArrivals: number
}

export interface LudoRecap {
  totalTurns: number
  players: LudoPlayerRecap[]
}

export function summarizeLudo(log: MatchLog<LudoTurnResolution, LudoRules>): LudoRecap {
  const players: LudoPlayerRecap[] = log.players.map((p) => ({
    name: p.name,
    color: p.color,
    rolls: 0,
    luckyRolls: 0,
    captures: 0,
    timesCaptured: 0,
    releases: 0,
    homeArrivals: 0,
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
    if (r.releasedFromBase) stats.releases++
    if (r.reachedHome) stats.homeArrivals++
    stats.captures += r.captures.length
    for (const cap of r.captures) {
      const victim = players[cap.seat]
      if (victim) victim.timesCaptured++
    }
  }

  return { totalTurns, players }
}
