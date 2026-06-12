import { describe, expect, it } from 'vitest'
import { summarizeSnakes } from './recap'
import { resolveTurn } from './rules'
import { DEFAULT_SNAKES_RULES } from './config'
import { layoutForRules } from './boardGen'
import type { MatchLog } from '../lib/matchLog'
import type { DieValue, SnakesRules, TurnResolution } from './types'

const CLASSIC = layoutForRules(DEFAULT_SNAKES_RULES)

const turn = (seat: number, from: number, roll: DieValue) => ({
  kind: 'turn' as const,
  seat,
  resolution: resolveTurn({
    board: CLASSIC,
    positions: [from, 0],
    playerIndex: 0,
    hasShield: false,
    dice: [roll],
  }),
})

const log = (events: MatchLog<TurnResolution, SnakesRules>['events']) => ({
  players: [
    { name: 'A', color: '#f00' },
    { name: 'B', color: '#00f' },
  ],
  rules: { ...DEFAULT_SNAKES_RULES },
  events,
})

describe('summarizeSnakes', () => {
  it('counts rolls, ladders, snakes, sixes, and bounces per player', () => {
    const recap = summarizeSnakes(
      log([
        turn(0, 0, 1), // ladder 1→38 for A
        turn(1, 10, 6), // snake 16→6 for B, and a six
        turn(0, 95, 6), // bounce for A
        { kind: 'skip', seat: 1 },
      ]),
    )
    expect(recap.totalTurns).toBe(3) // skips don't count as rolls
    const [a, b] = recap.players
    expect(a).toMatchObject({ rolls: 2, laddersClimbed: 1, bounces: 1, biggestClimb: 37 })
    expect(b).toMatchObject({ rolls: 1, snakesHit: 1, luckyRolls: 1, biggestSlide: 10 })
  })

  it('treats doubles as the lucky roll with two dice', () => {
    const doubles = {
      kind: 'turn' as const,
      seat: 0,
      resolution: resolveTurn({
        board: CLASSIC,
        positions: [10, 0],
        playerIndex: 0,
        hasShield: false,
        dice: [2, 2],
      }),
    }
    const recap = summarizeSnakes(log([doubles]))
    expect(recap.players[0].luckyRolls).toBe(1)
  })
})
