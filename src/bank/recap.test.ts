import { describe, expect, it } from 'vitest'
import { summarizeBank } from './recap'
import { DEFAULT_BANK_RULES } from './config'
import type { MatchLog } from '../lib/matchLog'
import type { BankRules, BankTurnResolution, TurnEffect } from './types'

const move = (from: number, to: number): TurnEffect => ({
  kind: 'move',
  from,
  to,
  path: [],
  passedStart: false,
})

const log: MatchLog<BankTurnResolution, BankRules> = {
  players: [
    { name: 'A', color: '#f00' },
    { name: 'B', color: '#0f0' },
  ],
  rules: { ...DEFAULT_BANK_RULES },
  events: [
    // A rolls onto an unowned property (buy offered)
    {
      kind: 'turn',
      seat: 0,
      resolution: {
        type: 'roll',
        usedFastBus: false,
        seat: 0,
        dice: [2, 3],
        effects: [move(0, 5)],
        finalTile: 5,
        buyOption: { tile: 5, price: 80 },
        isWin: false,
        winnerId: null,
      },
    },
    // A buys it
    { kind: 'turn', seat: 0, resolution: { type: 'decision', seat: 0, tile: 5, action: 'buy', price: 80 } },
    // B lands on A's property and pays rent
    {
      kind: 'turn',
      seat: 1,
      resolution: {
        type: 'roll',
        usedFastBus: false,
        seat: 1,
        dice: [3, 2],
        effects: [move(0, 5), { kind: 'pay', from: 1, to: 0, amount: 4, reason: 'rent' }],
        finalTile: 5,
        buyOption: null,
        isWin: false,
        winnerId: null,
      },
    },
    // A pays income tax
    {
      kind: 'turn',
      seat: 0,
      resolution: {
        type: 'roll',
        usedFastBus: false,
        seat: 0,
        dice: [2, 2],
        effects: [move(5, 4), { kind: 'cash', seat: 0, delta: -100, reason: 'tax' }],
        finalTile: 4,
        buyOption: null,
        isWin: false,
        winnerId: null,
      },
    },
    // B collects a reward
    {
      kind: 'turn',
      seat: 1,
      resolution: {
        type: 'roll',
        usedFastBus: false,
        seat: 1,
        dice: [1, 1],
        effects: [move(5, 7), { kind: 'cash', seat: 1, delta: 100, reason: 'reward' }],
        finalTile: 7,
        buyOption: null,
        isWin: false,
        winnerId: null,
      },
    },
    // A draws a luck dividend
    {
      kind: 'turn',
      seat: 0,
      resolution: {
        type: 'roll',
        usedFastBus: false,
        seat: 0,
        dice: [1, 1],
        effects: [
          move(4, 2),
          { kind: 'card', deck: 'luck', cardId: 'dividend' },
          { kind: 'cash', seat: 0, delta: 150, reason: 'luck' },
        ],
        finalTile: 2,
        buyOption: null,
        isWin: false,
        winnerId: null,
      },
    },
    // B goes to jail
    {
      kind: 'turn',
      seat: 1,
      resolution: {
        type: 'roll',
        usedFastBus: false,
        seat: 1,
        dice: [1, 1],
        effects: [move(7, 30), { kind: 'jail', seat: 1 }],
        finalTile: 10,
        buyOption: null,
        isWin: false,
        winnerId: null,
      },
    },
    // B skips a jailed turn
    { kind: 'turn', seat: 1, resolution: { type: 'jailSkip', seat: 1 } },
    // A draws a collect-each from B
    {
      kind: 'turn',
      seat: 0,
      resolution: {
        type: 'roll',
        usedFastBus: false,
        seat: 0,
        dice: [1, 1],
        effects: [
          move(2, 12),
          { kind: 'card', deck: 'luck', cardId: 'birthday' },
          { kind: 'collect', to: 0, froms: [1], amount: 50, reason: 'luck-collect-each' },
        ],
        finalTile: 12,
        buyOption: null,
        isWin: false,
        winnerId: null,
      },
    },
  ],
}

describe('summarizeBank', () => {
  const recap = summarizeBank(log)

  it('counts every committed event as a turn', () => {
    expect(recap.totalTurns).toBe(9)
  })

  it('tallies player A (buyer / tax payer / luck winner / rent collector)', () => {
    expect(recap.players[0]).toMatchObject({
      name: 'A',
      rolls: 4,
      propertiesBought: 1,
      rentPaid: 0,
      rentCollected: 4,
      taxesPaid: 100,
      rewardsEarned: 200,
      cardsDrawn: 2,
      jailVisits: 0,
      bankrupt: false,
      finalCash: 1524,
    })
  })

  it('tallies player B (rent payer / reward earner / jailed)', () => {
    expect(recap.players[1]).toMatchObject({
      name: 'B',
      rolls: 3,
      propertiesBought: 0,
      rentPaid: 4,
      rentCollected: 0,
      taxesPaid: 50,
      rewardsEarned: 100,
      cardsDrawn: 0,
      jailVisits: 1,
      bankrupt: false,
      finalCash: 1546,
    })
  })
})

describe('summarizeBank — manage + trade events (P3/P4)', () => {
  const mlog: MatchLog<BankTurnResolution, BankRules> = {
    players: [
      { name: 'A', color: '#f00' },
      { name: 'B', color: '#0f0' },
    ],
    rules: { ...DEFAULT_BANK_RULES },
    events: [
      // A builds a house for 50
      { kind: 'turn', seat: 0, resolution: { type: 'manage', seat: 0, effects: [{ kind: 'upgrade', seat: 0, tile: 5, level: 1, cost: 50 }] } },
      // A mortgages a property for +60
      { kind: 'turn', seat: 0, resolution: { type: 'manage', seat: 0, effects: [{ kind: 'mortgage', seat: 0, tile: 7, amount: 60 }] } },
      // A pays B 100 cash in a trade
      { kind: 'turn', seat: 0, resolution: { type: 'trade', from: 0, to: 1, giveTiles: [], giveCash: 100, receiveTiles: [21], receiveCash: 0 } },
    ],
  }
  const recap = summarizeBank(mlog)

  it('counts every management action as a turn', () => {
    expect(recap.totalTurns).toBe(3)
  })

  it('counts houses built and threads cash through manage + trade', () => {
    expect(recap.players[0].housesBuilt).toBe(1)
    // 1500 − 50 (house) + 60 (mortgage) − 100 (trade cash) = 1410
    expect(recap.players[0].finalCash).toBe(1410)
    expect(recap.players[1].finalCash).toBe(1600) // received 100 in the trade
  })
})
