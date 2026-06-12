import { describe, expect, it } from 'vitest'
import { summarizeLudo } from './recap'
import { DEFAULT_LUDO_RULES } from './config'
import type { MatchLog } from '../lib/matchLog'
import type { DieValue, LudoRules, LudoTurnResolution } from './types'

const turn = (
  seat: number,
  over: Partial<LudoTurnResolution> & { dice?: DieValue[] },
): MatchLog<LudoTurnResolution, LudoRules>['events'][number] => ({
  kind: 'turn',
  seat,
  resolution: {
    seat,
    dice: [3],
    roll: 3,
    tokenId: 0,
    from: 5,
    to: 8,
    releasedFromBase: false,
    stepPath: [6, 7, 8],
    captures: [],
    reachedHome: false,
    isWin: false,
    extraTurn: false,
    sixCount: 0,
    noMove: false,
    ...over,
  },
})

describe('summarizeLudo', () => {
  it('counts captures both ways, releases, home arrivals, and lucky rolls', () => {
    const recap = summarizeLudo({
      players: [
        { name: 'A', color: '#f00' },
        { name: 'B', color: '#00f' },
      ],
      rules: { ...DEFAULT_LUDO_RULES },
      events: [
        turn(0, { dice: [6], roll: 6, releasedFromBase: true }),
        turn(0, { captures: [{ seat: 1, tokenId: 0 }] }),
        turn(1, { reachedHome: true }),
        { kind: 'skip', seat: 1 },
        { kind: 'decision', decision: 'continue' },
      ],
    })
    expect(recap.totalTurns).toBe(3)
    const [a, b] = recap.players
    expect(a).toMatchObject({ rolls: 2, luckyRolls: 1, releases: 1, captures: 1, timesCaptured: 0 })
    expect(b).toMatchObject({ rolls: 1, homeArrivals: 1, captures: 0, timesCaptured: 1 })
  })

  it('counts doubles (not a lone six) as lucky with two dice', () => {
    const recap = summarizeLudo({
      players: [{ name: 'A', color: '#f00' }],
      rules: { ...DEFAULT_LUDO_RULES, diceCount: 2 },
      events: [
        turn(0, { dice: [4, 4], roll: 8 }),
        turn(0, { dice: [6, 2], roll: 8 }),
      ],
    })
    expect(recap.players[0].luckyRolls).toBe(1)
  })
})
