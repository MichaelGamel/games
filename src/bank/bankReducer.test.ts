import { describe, expect, it } from 'vitest'
import { bankReducer, initialBankState, type BankAction, type PlayerSetup } from './bankReducer'
import { DEFAULT_BANK_RULES } from './config'
import type { BankGameState, BankTurnResolution } from './types'

const PLAYERS: PlayerSetup[] = [
  { name: 'A', color: '#f00' },
  { name: 'B', color: '#0f0' },
  { name: 'C', color: '#00f' },
]

const start = (players: PlayerSetup[] = PLAYERS): BankGameState =>
  bankReducer(initialBankState, { type: 'START_GAME', players })

const commit = (state: BankGameState, resolution: BankTurnResolution): BankGameState =>
  bankReducer(state, { type: 'COMMIT_TURN', resolution })

// --- START_GAME ------------------------------------------------------------

describe('bankReducer — START_GAME', () => {
  it('seats everyone with the starting cash on Start, idle', () => {
    const state = start()
    expect(state.phase).toBe('idle')
    expect(state.currentPlayerIndex).toBe(0)
    expect(state.turnCount).toBe(0)
    expect(state.ownership).toEqual({})
    expect(state.players).toHaveLength(3)
    for (const p of state.players) {
      expect(p).toMatchObject({ position: 0, cash: 1500, status: 'active', jailTurns: 0 })
    }
  })
})

// --- COMMIT_TURN: roll → deciding → decision -------------------------------

describe('bankReducer — buy decision flow', () => {
  const rollToBuy: BankTurnResolution = {
    type: 'roll',
    usedFastBus: false,
    seat: 0,
    dice: [2, 3],
    effects: [{ kind: 'move', from: 0, to: 5, path: [1, 2, 3, 4, 5], passedStart: false }],
    finalTile: 5,
    buyOption: { tile: 5, price: 80 },
    isWin: false,
    winnerId: null,
  }

  it('opens the buy choice and keeps the acting seat', () => {
    const state = commit(start(), rollToBuy)
    expect(state.phase).toBe('deciding')
    expect(state.pendingBuy).toEqual({ seat: 0, tile: 5, price: 80 })
    expect(state.currentPlayerIndex).toBe(0)
    expect(state.players[0].position).toBe(5)
    expect(state.turnCount).toBe(1)
  })

  it('buy deducts the price, records ownership, and advances', () => {
    const state = commit(commit(start(), rollToBuy), {
      type: 'decision',
      seat: 0,
      tile: 5,
      action: 'buy',
      price: 80,
    })
    expect(state.players[0].cash).toBe(1420)
    expect(state.ownership[5]).toEqual({ owner: 0, level: 0, mortgaged: false })
    expect(state.pendingBuy).toBeNull()
    expect(state.currentPlayerIndex).toBe(1)
    expect(state.phase).toBe('idle')
    expect(state.turnCount).toBe(2)
  })

  it('decline changes nothing but advances', () => {
    const state = commit(commit(start(), rollToBuy), {
      type: 'decision',
      seat: 0,
      tile: 5,
      action: 'decline',
      price: 80,
    })
    expect(state.players[0].cash).toBe(1500)
    expect(state.ownership).toEqual({})
    expect(state.currentPlayerIndex).toBe(1)
    expect(state.turnCount).toBe(2)
  })
})

// --- COMMIT_TURN: jail skip ------------------------------------------------

describe('bankReducer — jail skip is exactly one turn', () => {
  it('decrements jailTurns to free the player and advances', () => {
    const jailed = start()
    jailed.players[0].jailTurns = 1
    const state = commit(jailed, { type: 'jailSkip', seat: 0 })
    expect(state.players[0].jailTurns).toBe(0)
    expect(state.currentPlayerIndex).toBe(1)
    expect(state.turnCount).toBe(1)
  })
})

// --- COMMIT_TURN: Fast Bus buff --------------------------------------------

describe('bankReducer — Fast Bus buff', () => {
  const fastBusRoll: BankTurnResolution = {
    type: 'roll',
    usedFastBus: false,
    seat: 0,
    dice: [4, 6],
    effects: [
      { kind: 'move', from: 10, to: 20, path: [], passedStart: false },
      { kind: 'fastBus', seat: 0 },
    ],
    finalTile: 20,
    buyOption: null,
    isWin: false,
    winnerId: null,
  }

  it('grants the buff on landing, then consumes it on the doubled roll', () => {
    const granted = commit(start(), fastBusRoll)
    expect(granted.players[0].fastBus).toBe(true)

    // The seat's next roll is flagged `usedFastBus` and the buff clears.
    const consumed = commit(granted, {
      type: 'roll',
      usedFastBus: true,
      seat: 0,
      dice: [2, 2],
      effects: [{ kind: 'move', from: 20, to: 28, path: [], passedStart: false }],
      finalTile: 28,
      buyOption: null,
      isWin: false,
      winnerId: null,
    })
    expect(consumed.players[0].fastBus).toBe(false)
  })
})

// --- COMMIT_TURN: bankruptcy & win -----------------------------------------

describe('bankReducer — bankruptcy and win', () => {
  const bankruptRoll = (seat: number, releasedTiles: number[], isWin: boolean, winnerId: number | null): BankTurnResolution => ({
    type: 'roll',
    usedFastBus: false,
    seat,
    dice: [1, 1],
    effects: [
      { kind: 'move', from: 7, to: 9, path: [8, 9], passedStart: false },
      { kind: 'bankrupt', seat, releasedTiles },
    ],
    finalTile: 9,
    buyOption: null,
    isWin,
    winnerId,
  })

  it('frees the bankrupt player’s tiles and skips them in the rotation', () => {
    const base = start()
    base.ownership = { 5: { owner: 0, level: 0, mortgaged: false }, 9: { owner: 1, level: 0, mortgaged: false } }
    const state = commit(base, bankruptRoll(0, [5], false, null))
    expect(state.players[0].status).toBe('bankrupt')
    expect(state.players[0].cash).toBe(0)
    expect(state.ownership[5]).toBeUndefined()
    expect(state.ownership[9]).toBeDefined() // seat 1 keeps theirs
    expect(state.bankruptedOrder).toEqual([0])
    expect(state.currentPlayerIndex).toBe(1)
  })

  it('skips already-bankrupt seats when advancing', () => {
    const base = start()
    base.players[1].status = 'bankrupt'
    const state = commit(base, bankruptRoll(0, [], false, null))
    expect(state.currentPlayerIndex).toBe(2) // 1 is bankrupt, skip to 2
  })

  it('ends the match when only one active player remains', () => {
    const base = start([PLAYERS[0], PLAYERS[1]])
    const state = commit(base, bankruptRoll(0, [], true, 1))
    expect(state.phase).toBe('won')
    expect(state.winnerId).toBe(1)
    expect(state.winReason).toBe('lastStanding')
    expect(state.turnCount).toBe(1)
  })
})

// --- the deterministic-replay property -------------------------------------

describe('bankReducer — deterministic replay', () => {
  const script: BankAction[] = [
    { type: 'START_GAME', players: PLAYERS },
    {
      type: 'COMMIT_TURN',
      resolution: {
        type: 'roll',
        usedFastBus: false,
        seat: 0,
        dice: [2, 3],
        effects: [{ kind: 'move', from: 0, to: 5, path: [1, 2, 3, 4, 5], passedStart: false }],
        finalTile: 5,
        buyOption: { tile: 5, price: 80 },
        isWin: false,
        winnerId: null,
      },
    },
    { type: 'COMMIT_TURN', resolution: { type: 'decision', seat: 0, tile: 5, action: 'buy', price: 80 } },
    {
      type: 'COMMIT_TURN',
      resolution: {
        type: 'roll',
        usedFastBus: false,
        seat: 1,
        dice: [3, 4],
        effects: [
          { kind: 'move', from: 0, to: 7, path: [1, 2, 3, 4, 5, 6, 7], passedStart: false },
          { kind: 'cash', seat: 1, delta: 100, reason: 'reward' },
        ],
        finalTile: 7,
        buyOption: null,
        isWin: false,
        winnerId: null,
      },
    },
    {
      type: 'COMMIT_TURN',
      resolution: {
        type: 'roll',
        usedFastBus: false,
        seat: 2,
        dice: [2, 2],
        effects: [
          { kind: 'move', from: 0, to: 4, path: [1, 2, 3, 4], passedStart: false },
          { kind: 'cash', seat: 2, delta: -100, reason: 'tax' },
        ],
        finalTile: 4,
        buyOption: null,
        isWin: false,
        winnerId: null,
      },
    },
    {
      type: 'COMMIT_TURN',
      resolution: {
        type: 'roll',
        usedFastBus: false,
        seat: 0,
        dice: [2, 2],
        effects: [{ kind: 'move', from: 5, to: 9, path: [6, 7, 8, 9], passedStart: false }],
        finalTile: 9,
        buyOption: { tile: 9, price: 120 },
        isWin: false,
        winnerId: null,
      },
    },
    { type: 'COMMIT_TURN', resolution: { type: 'decision', seat: 0, tile: 9, action: 'decline', price: 120 } },
  ]

  const run = () => script.reduce(bankReducer, initialBankState)

  it('a scripted resolution list applied twice yields byte-identical state', () => {
    expect(run()).toEqual(run())
  })

  it('reaches the expected committed state', () => {
    const state = run()
    expect(state.turnCount).toBe(6)
    expect(state.currentPlayerIndex).toBe(1)
    expect(state.phase).toBe('idle')
    expect(state.players[0]).toMatchObject({ cash: 1420 })
    expect(state.players[1].cash).toBe(1600)
    expect(state.players[2].cash).toBe(1400)
    expect(state.ownership).toEqual({ 5: { owner: 0, level: 0, mortgaged: false } })
  })
})

// --- doubles → extra turn (P2) ---------------------------------------------

describe('bankReducer — doubles extra turn (P2)', () => {
  const moveRoll = (
    seat: number,
    from: number,
    to: number,
    extra: Partial<Extract<BankTurnResolution, { type: 'roll' }>> = {},
  ): BankTurnResolution => ({
    type: 'roll',
    usedFastBus: false,
    seat,
    dice: [2, 2],
    effects: [{ kind: 'move', from, to, path: [], passedStart: false }],
    finalTile: to,
    buyOption: null,
    isWin: false,
    winnerId: null,
    ...extra,
  })

  it('keeps the seat and records the chain on an extra-turn roll', () => {
    const s = commit(start(), moveRoll(0, 0, 4, { extraTurn: true, doublesCount: 1 }))
    expect(s.currentPlayerIndex).toBe(0)
    expect(s.consecutiveDoubles).toBe(1)
    expect(s.phase).toBe('idle')
  })

  it('advances and clears the chain on a non-extra roll', () => {
    const s = commit(start(), moveRoll(0, 0, 5, { dice: [2, 3] }))
    expect(s.currentPlayerIndex).toBe(1)
    expect(s.consecutiveDoubles).toBe(0)
  })

  it('still grants the extra turn after a buy decision taken mid-chain', () => {
    const afterRoll = commit(
      start(),
      moveRoll(0, 0, 8, { buyOption: { tile: 8, price: 200 }, extraTurn: true, doublesCount: 1 }),
    )
    expect(afterRoll.phase).toBe('deciding')
    expect(afterRoll.currentPlayerIndex).toBe(0)
    expect(afterRoll.consecutiveDoubles).toBe(1)

    const afterBuy = commit(afterRoll, { type: 'decision', seat: 0, tile: 8, action: 'buy', price: 200 })
    expect(afterBuy.currentPlayerIndex).toBe(0) // extra roll preserved through the buy
    expect(afterBuy.phase).toBe('idle')
    expect(afterBuy.consecutiveDoubles).toBe(1)
  })
})

// --- richer jail effects (P2) ----------------------------------------------

describe('bankReducer — richer jail effects (P2)', () => {
  const jailRoll = (effects: Extract<BankTurnResolution, { type: 'roll' }>['effects'], finalTile: number): BankTurnResolution => ({
    type: 'roll',
    usedFastBus: false,
    seat: 0,
    dice: [1, 3],
    effects,
    finalTile,
    buyOption: null,
    isWin: false,
    winnerId: null,
  })

  it('a jail effect sets three escape attempts and parks at tile 30', () => {
    const base = start([PLAYERS[0], PLAYERS[1]])
    const s = commit(base, {
      type: 'roll',
      usedFastBus: false,
      seat: 0,
      dice: [3, 4],
      effects: [{ kind: 'move', from: 0, to: 7, path: [], passedStart: false }, { kind: 'jail', seat: 0 }],
      finalTile: 30,
      buyOption: null,
      isWin: false,
      winnerId: null,
    })
    expect(s.players[0].jailTurns).toBe(3)
    expect(s.players[0].position).toBe(30)
  })

  it('jailStay decrements the attempts and passes the turn', () => {
    const base = start([PLAYERS[0], PLAYERS[1]])
    base.players[0].jailTurns = 3
    const s = commit(base, jailRoll([{ kind: 'jailStay', seat: 0 }], 30))
    expect(s.players[0].jailTurns).toBe(2)
    expect(s.currentPlayerIndex).toBe(1)
  })

  it('jailRelease via card frees the seat and spends a card', () => {
    const base = start([PLAYERS[0], PLAYERS[1]])
    base.players[0].jailTurns = 3
    base.players[0].jailCards = 1
    const s = commit(
      base,
      jailRoll(
        [{ kind: 'jailRelease', seat: 0, via: 'card' }, { kind: 'move', from: 30, to: 33, path: [], passedStart: false }],
        33,
      ),
    )
    expect(s.players[0].jailTurns).toBe(0)
    expect(s.players[0].jailCards).toBe(0)
    expect(s.players[0].position).toBe(33)
  })

  it('grantJailCard banks a Get-Out-of-Jail card', () => {
    const base = start([PLAYERS[0], PLAYERS[1]])
    const s = commit(
      base,
      jailRoll(
        [
          { kind: 'move', from: 0, to: 6, path: [], passedStart: false },
          { kind: 'card', deck: 'luck', cardId: 'getOutOfJail' },
          { kind: 'grantJailCard', seat: 0 },
        ],
        6,
      ),
    )
    expect(s.players[0].jailCards).toBe(1)
  })
})

// --- timed mode / round cap (P2) -------------------------------------------

describe('bankReducer — timed mode (P2)', () => {
  it('ends after maxRounds with the richest active player winning', () => {
    let s = bankReducer(initialBankState, {
      type: 'START_GAME',
      players: [PLAYERS[0], PLAYERS[1]],
      rules: { ...DEFAULT_BANK_RULES, doubles: false, maxRounds: 1 },
    })
    // Seat 0's turn does not complete a round (no wrap yet).
    s = commit(s, {
      type: 'roll',
      usedFastBus: false,
      seat: 0,
      dice: [1, 2],
      effects: [{ kind: 'move', from: 0, to: 3, path: [], passedStart: false }],
      finalTile: 3,
      buyOption: null,
      isWin: false,
      winnerId: null,
    })
    expect(s.phase).toBe('idle')
    expect(s.currentPlayerIndex).toBe(1)

    // Seat 1 collects a reward, then the rotation wraps → round 1 → game ends.
    s = commit(s, {
      type: 'roll',
      usedFastBus: false,
      seat: 1,
      dice: [1, 2],
      effects: [
        { kind: 'move', from: 0, to: 3, path: [], passedStart: false },
        { kind: 'cash', seat: 1, delta: 300, reason: 'reward' },
      ],
      finalTile: 3,
      buyOption: null,
      isWin: false,
      winnerId: null,
    })
    expect(s.phase).toBe('won')
    expect(s.winReason).toBe('rounds')
    expect(s.winnerId).toBe(1) // 1800 vs 1500
  })
})

// --- management actions: upgrades + mortgage (P3/P4) -----------------------

describe('bankReducer — manage actions keep the seat (P3/P4)', () => {
  const owned = (tile: number, owner: number, level = 0, mortgaged = false) => ({
    [tile]: { owner, level, mortgaged },
  })

  it('builds a house: raises the level, pays the bank, keeps the turn', () => {
    const base = start([PLAYERS[0], PLAYERS[1]])
    base.ownership = owned(5, 0)
    base.consecutiveDoubles = 1 // a mid-chain build must not drop the extra roll
    const s = commit(base, { type: 'manage', seat: 0, effects: [{ kind: 'upgrade', seat: 0, tile: 5, level: 1, cost: 50 }] })
    expect(s.ownership[5]).toEqual({ owner: 0, level: 1, mortgaged: false })
    expect(s.players[0].cash).toBe(1450)
    expect(s.currentPlayerIndex).toBe(0)
    expect(s.phase).toBe('idle')
    expect(s.consecutiveDoubles).toBe(1)
    expect(s.turnCount).toBe(1)
  })

  it('sells a house: lowers the level and refunds', () => {
    const base = start([PLAYERS[0], PLAYERS[1]])
    base.ownership = owned(5, 0, 2)
    const s = commit(base, { type: 'manage', seat: 0, effects: [{ kind: 'sell', seat: 0, tile: 5, level: 1, refund: 25 }] })
    expect(s.ownership[5].level).toBe(1)
    expect(s.players[0].cash).toBe(1525)
  })

  it('mortgages and lifts a mortgage, moving cash the right way', () => {
    const base = start([PLAYERS[0], PLAYERS[1]])
    base.ownership = owned(5, 0)
    const mortgaged = commit(base, { type: 'manage', seat: 0, effects: [{ kind: 'mortgage', seat: 0, tile: 5, amount: 50 }] })
    expect(mortgaged.ownership[5].mortgaged).toBe(true)
    expect(mortgaged.players[0].cash).toBe(1550)

    const lifted = commit(mortgaged, { type: 'manage', seat: 0, effects: [{ kind: 'unmortgage', seat: 0, tile: 5, cost: 55 }] })
    expect(lifted.ownership[5].mortgaged).toBe(false)
    expect(lifted.players[0].cash).toBe(1495)
  })

  it('completes a trade: swaps ownership + cash, keeps the seat', () => {
    const base = start([PLAYERS[0], PLAYERS[1]])
    base.ownership = { ...owned(3, 0), ...owned(21, 1) }
    const s = commit(base, {
      type: 'trade',
      from: 0,
      to: 1,
      giveTiles: [3],
      giveCash: 100,
      receiveTiles: [21],
      receiveCash: 0,
    })
    expect(s.ownership[3].owner).toBe(1)
    expect(s.ownership[21].owner).toBe(0)
    expect(s.players[0].cash).toBe(1400)
    expect(s.players[1].cash).toBe(1600)
    expect(s.currentPlayerIndex).toBe(0)
    expect(s.phase).toBe('idle')
    expect(s.turnCount).toBe(1)
  })
})

// --- RESET / RESTORE -------------------------------------------------------

describe('bankReducer — reset and restore', () => {
  it('RESET returns the initial state and RESTORE swaps the whole state in', () => {
    const live = commit(start(), {
      type: 'roll',
      usedFastBus: false,
      seat: 0,
      dice: [1, 1],
      effects: [{ kind: 'move', from: 0, to: 2, path: [1, 2], passedStart: false }],
      finalTile: 2,
      buyOption: null,
      isWin: false,
      winnerId: null,
    })
    expect(bankReducer(live, { type: 'RESET' })).toEqual(initialBankState)
    const snapshot = start()
    expect(bankReducer(live, { type: 'RESTORE', state: snapshot })).toBe(snapshot)
  })
})
