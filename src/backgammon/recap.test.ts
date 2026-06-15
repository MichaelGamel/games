import { describe, expect, it } from 'vitest'
import { summarizeBackgammon } from './recap'
import { OFF } from './config'
import type { MatchLog } from '../lib/matchLog'
import type { BackgammonRules, BackgammonTurnResolution, DieValue } from './types'

const log = (events: MatchLog<BackgammonTurnResolution, BackgammonRules>['events']): MatchLog<
  BackgammonTurnResolution,
  BackgammonRules
> => ({
  players: [
    { name: 'A', color: '#fff' },
    { name: 'B', color: '#000' },
  ],
  rules: { doublingCube: false, matchLength: 1, autoBearOffOverflow: true },
  events,
})

const turn = (seat: number, over: Partial<BackgammonTurnResolution>): BackgammonTurnResolution => ({
  seat,
  dice: [3, 4] as DieValue[],
  moves: [],
  noLegalMoves: false,
  isWin: false,
  winReason: null,
  ...over,
})

describe('summarizeBackgammon', () => {
  it('tallies rolls, doubles, hits, times-hit and bear-offs', () => {
    const recap = summarizeBackgammon(
      log([
        { kind: 'turn', seat: 0, resolution: turn(0, { dice: [5, 5] as DieValue[], moves: [{ from: 10, to: 7, die: 5, hit: true }] }) },
        { kind: 'turn', seat: 1, resolution: turn(1, { moves: [{ from: 7, to: 11, die: 4, hit: false }] }) },
        { kind: 'turn', seat: 0, resolution: turn(0, { moves: [{ from: 1, to: OFF, die: 1, hit: false }] }) },
      ]),
    )
    expect(recap.totalTurns).toBe(3)
    const [a, b] = recap.players
    expect(a.rolls).toBe(2)
    expect(a.doubles).toBe(1)
    expect(a.hits).toBe(1)
    expect(a.borneOff).toBe(1)
    expect(b.timesHit).toBe(1)
    expect(b.rolls).toBe(1)
  })
})
