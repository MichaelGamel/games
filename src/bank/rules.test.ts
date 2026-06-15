import { describe, expect, it } from 'vitest'
import {
  buildJailSkip,
  buildMortgage,
  buildSell,
  buildTrade,
  buildUnmortgage,
  buildUpgrade,
  canAfford,
  canBuildHouse,
  canMortgage,
  canSellHouse,
  canTrade,
  canUnmortgage,
  houseCost,
  mortgageValue,
  netWorth,
  rentFor,
  resolveBuyDecision,
  resolveDecline,
  resolveTurn,
  sellRefund,
  unmortgageCost,
  type Rng,
  type TradeOffer,
} from './rules'
import { BOARD, COURT_DECK, DEFAULT_BANK_RULES, JAIL_TILE, LUCK_DECK, MAX_CARD_CHAIN } from './config'
import type { BankGameState, BankPlayer, CardDeck, DieValue, Ownership, TurnEffect } from './types'

// --- fixtures --------------------------------------------------------------
//
// The 34-tile board (corners 0 Start / 7 Lucky Club / 17 Fast Bus / 24 Jail):
//   • Card cells — luck: 3, 12, 29 · court: 10, 20, 31
//   • Color group A = tiles 4, 5, 6 (Beirut / Riyadh / Baghdad)
//   • The lone utility (group U) = tile 15 (petrol)
// A handy way to land on a card tile: start one tile before it and roll a 2,
// e.g. from 1 → 3 (luck) or from 8 → 10 (court).

function player(id: number, position: number, cash: number, extra: Partial<BankPlayer> = {}): BankPlayer {
  return {
    id,
    name: `P${id}`,
    color: '#fff',
    position,
    cash,
    status: 'active',
    jailTurns: 0,
    jailCards: 0,
    fastBus: false,
    isBot: false,
    ...extra,
  }
}

function makeState(players: BankPlayer[], overrides: Partial<BankGameState> = {}): BankGameState {
  return {
    players,
    ownership: {},
    currentPlayerIndex: 0,
    phase: 'idle',
    rules: { ...DEFAULT_BANK_RULES },
    lastDice: [],
    pendingBuy: null,
    bankruptedOrder: [],
    winnerId: null,
    winReason: null,
    consecutiveDoubles: 0,
    round: 0,
    turnCount: 0,
    ...overrides,
  }
}

const own = (owner: number): Ownership => ({ owner, level: 0, mortgaged: false })
const d = (a: DieValue, b: DieValue): [DieValue, DieValue] => [a, b]
const priceOf = (tile: number) => BOARD[tile].price ?? 0
const rentOf = (tile: number) => BOARD[tile].rent ?? 0

/** An rng that always draws a specific card from a deck (robust to deck order). */
const draws = (deck: CardDeck, cardId: string): Rng => {
  const cards = deck === 'luck' ? LUCK_DECK : COURT_DECK
  const idx = cards.findIndex((c) => c.id === cardId)
  return () => (idx + 0.5) / cards.length
}

const kinds = (effects: TurnEffect[]) => effects.map((e) => e.kind)
const only = <K extends TurnEffect['kind']>(effects: TurnEffect[], kind: K) =>
  effects.filter((e) => e.kind === kind) as Extract<TurnEffect, { kind: K }>[]

function roll(state: BankGameState, dice: [DieValue, DieValue], rng?: Rng) {
  const r = resolveTurn({ state, dice, rng })
  if (r.type !== 'roll') throw new Error('expected a roll resolution')
  return r
}

// --- movement & buy options ------------------------------------------------

describe('resolveTurn — movement, pass-start and buy options', () => {
  it('reaches the right final tile and pays the start reward exactly once when wrapping', () => {
    const r = roll(makeState([player(0, 32, 1500)]), d(1, 2)) // 32 + 3 → wraps to tile 1
    expect(r.finalTile).toBe(1)
    expect(kinds(r.effects).slice(0, 2)).toEqual(['move', 'passStart'])
    expect(only(r.effects, 'passStart')).toHaveLength(1)
    expect(only(r.effects, 'passStart')[0].amount).toBe(200)
    expect(r.buyOption).toEqual({ tile: 1, price: priceOf(1) })
  })

  it('offers a buy only when the property is unowned and affordable', () => {
    // owned by self → no buy, no rent
    const mine = roll(makeState([player(0, 32, 1500)], { ownership: { 1: own(0) } }), d(1, 2))
    expect(mine.buyOption).toBeNull()
    expect(only(mine.effects, 'pay')).toHaveLength(0)

    // unaffordable (cash below price, no pass-start) → no buy
    const broke = roll(makeState([player(0, 3, 50)]), d(1, 1)) // → tile 5 (Riyadh), price 250
    expect(broke.buyOption).toBeNull()
  })

  it('charges rent (rentFor) when landing on a rival-owned property', () => {
    const state = makeState([player(0, 32, 1500), player(1, 20, 1500)], { ownership: { 1: own(1) } })
    const r = roll(state, d(1, 2)) // → tile 1, owned by seat 1
    const pay = only(r.effects, 'pay')
    expect(pay).toHaveLength(1)
    expect(pay[0]).toMatchObject({ from: 0, to: 1, amount: rentOf(1), reason: 'rent' })
    expect(r.buyOption).toBeNull()
  })
})

// --- cards (Luck + Court) --------------------------------------------------

describe('resolveTurn — cards', () => {
  it('chains a luck move card into the next tile in order [card, move]', () => {
    const state = makeState([player(0, 1, 1500)])
    const r = roll(state, d(1, 1), draws('luck', 'advance3')) // → 3 (luck) → +3 → 6 (property)
    expect(kinds(r.effects)).toEqual(['move', 'card', 'move'])
    expect(only(r.effects, 'card')[0]).toMatchObject({ deck: 'luck', cardId: 'advance3' })
    expect(r.finalTile).toBe(6)
    expect(r.buyOption).toEqual({ tile: 6, price: priceOf(6) })
  })

  it('a luck cash card pays out in order [card, cash]', () => {
    const r = roll(makeState([player(0, 1, 1500)]), d(1, 1), draws('luck', 'dividend')) // → 3 (luck)
    expect(kinds(r.effects)).toEqual(['move', 'card', 'cash'])
    expect(only(r.effects, 'cash')[0]).toMatchObject({ delta: 150, reason: 'luck' })
  })

  it('a court card draws from the Court deck', () => {
    const r = roll(makeState([player(0, 8, 1500)]), d(1, 1), draws('court', 'inheritance')) // → 10 (court)
    expect(only(r.effects, 'card')[0]).toMatchObject({ deck: 'court', cardId: 'inheritance' })
    expect(only(r.effects, 'cash')[0]).toMatchObject({ delta: 200, reason: 'luck' })
  })

  it('bakes the card calculation (before / delta / after) into the card effect', () => {
    const r = roll(makeState([player(0, 1, 1500)]), d(1, 1), draws('luck', 'dividend')) // → 3 (luck) +150
    expect(only(r.effects, 'card')[0]).toMatchObject({
      balanceBefore: 1500,
      delta: 150,
      balanceAfter: 1650,
    })

    const fineHit = roll(makeState([player(0, 8, 1500)]), d(1, 1), draws('court', 'courtFine')) // → 10 −150
    expect(only(fineHit.effects, 'card')[0]).toMatchObject({
      balanceBefore: 1500,
      delta: -150,
      balanceAfter: 1350,
    })

    // A go-to-jail card has no direct cash impact → delta 0.
    const jailCard = roll(makeState([player(0, 1, 1500)]), d(1, 1), draws('luck', 'goToJail'))
    expect(only(jailCard.effects, 'card')[0]).toMatchObject({ delta: 0 })
  })

  it('go-to-jail (card) sends to jail (tile 24) with no pass-start and no buy option', () => {
    const r = roll(makeState([player(0, 1, 1500)]), d(1, 1), draws('luck', 'goToJail')) // → 3 (luck) → jail
    expect(only(r.effects, 'jail')[0]).toMatchObject({ seat: 0 })
    expect(only(r.effects, 'passStart')).toHaveLength(0)
    expect(r.finalTile).toBe(JAIL_TILE)
    expect(r.buyOption).toBeNull()
  })

  it('the Lucky Club (tile 7) charges a flat fee, no jail', () => {
    const r = roll(makeState([player(0, 5, 1500)]), d(1, 1)) // → tile 7 (lucky club)
    expect(only(r.effects, 'cash')[0]).toMatchObject({ delta: -30, reason: 'club' })
    expect(only(r.effects, 'jail')).toHaveLength(0)
    expect(r.finalTile).toBe(7)
  })

  it('the Fast Bus (tile 17) grants a buff that doubles the next roll', () => {
    const land = roll(makeState([player(0, 15, 1500)]), d(1, 1)) // → tile 17 (fast bus)
    expect(only(land.effects, 'fastBus')[0]).toMatchObject({ seat: 0 })
    expect(land.usedFastBus).toBe(false)

    // A held buff doubles the dice total: from 0, a roll of 2 moves 4 (to tile 4).
    const held = roll(makeState([player(0, 0, 1500, { fastBus: true })]), d(1, 1))
    expect(held.usedFastBus).toBe(true)
    expect(held.finalTile).toBe(4)
  })

  it('go-to-Start pays the start reward', () => {
    const r = roll(makeState([player(0, 27, 1500)]), d(1, 1), draws('luck', 'gotoStart')) // → 29 (luck) → Start
    expect(r.finalTile).toBe(0)
    expect(only(r.effects, 'passStart')[0].amount).toBe(200)
  })

  it('collect-each only takes from other solvent, active players', () => {
    const state = makeState([
      player(0, 1, 1500),
      player(1, 20, 100),
      player(2, 25, 30),
      player(3, 31, 500, { status: 'bankrupt' }),
    ])
    const r = roll(state, d(1, 1), draws('luck', 'birthday')) // → 3 (luck) → collect 50 from each
    const collect = only(r.effects, 'collect')
    expect(collect).toHaveLength(1)
    expect(collect[0].froms).toEqual([1]) // 2 can't afford, 3 is bankrupt
    expect(collect[0].amount).toBe(50)
  })

  it('pay-each pays every other active player', () => {
    const state = makeState([player(0, 1, 1500), player(1, 20, 100), player(2, 25, 100)])
    const r = roll(state, d(1, 1), draws('luck', 'charity')) // → 3 (luck) → pay 40 to each
    const pay = only(r.effects, 'pay')
    expect(pay).toHaveLength(2)
    expect(pay.every((p) => p.amount === 40 && p.reason === 'luck-pay-each')).toBe(true)
  })

  it('maintenance charges per owned property (−40 × owned), or nothing when none owned', () => {
    const withProps = makeState([player(0, 1, 1500)], { ownership: { 5: own(0), 9: own(0) } })
    const r = roll(withProps, d(1, 1), draws('luck', 'repairs')) // → 3 (luck) → 40 × 2
    expect(only(r.effects, 'cash')[0]).toMatchObject({ delta: -80, reason: 'maintenance' })

    const noProps = roll(makeState([player(0, 1, 1500)]), d(1, 1), draws('luck', 'repairs'))
    expect(only(noProps.effects, 'cash')).toHaveLength(0)
  })
})

// --- chain bound -----------------------------------------------------------

describe('resolveTurn — bounded chain (never loops)', () => {
  it('always terminates and never fires more than MAX_CARD_CHAIN cards', () => {
    let seed = 12345
    const rng: Rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    for (let from = 0; from < BOARD.length; from++) {
      for (let i = 0; i < 50; i++) {
        const r = roll(makeState([player(0, from, 1500), player(1, 0, 1500)]), d(3, 4), rng)
        expect(only(r.effects, 'card').length).toBeLessThanOrEqual(MAX_CARD_CHAIN)
        expect(r.effects.length).toBeLessThan(12)
      }
    }
  })
})

// --- bankruptcy & win ------------------------------------------------------

describe('resolveTurn — bankruptcy and last-standing win', () => {
  it('bankrupts a player who cannot pay rent in full and releases their tiles', () => {
    const state = makeState([player(0, 7, 5), player(1, 20, 1500)], {
      ownership: { 5: own(0), 9: own(1) },
    })
    const r = roll(state, d(1, 1)) // → tile 9, rent > 5 cash
    const bankrupt = only(r.effects, 'bankrupt')
    expect(bankrupt).toHaveLength(1)
    expect(bankrupt[0]).toMatchObject({ seat: 0, releasedTiles: [5] })
    expect(only(r.effects, 'pay')).toHaveLength(0) // no partial payment
    expect(r.isWin).toBe(true)
    expect(r.winnerId).toBe(1)
  })

  it('declares a winner when the second-to-last player is bankrupted', () => {
    const state = makeState(
      [player(0, 7, 5), player(1, 20, 1500), player(2, 31, 0, { status: 'bankrupt' })],
      { ownership: { 9: own(1) } },
    )
    const r = roll(state, d(1, 1)) // seat 0 bankrupts → only seat 1 left active
    expect(only(r.effects, 'bankrupt')).toHaveLength(1)
    expect(r.isWin).toBe(true)
    expect(r.winnerId).toBe(1)
  })

  it('does not declare a win while two players remain active', () => {
    const state = makeState([player(0, 7, 5), player(1, 20, 1500), player(2, 31, 1500)], {
      ownership: { 9: own(1) },
    })
    const r = roll(state, d(1, 1))
    expect(only(r.effects, 'bankrupt')).toHaveLength(1)
    expect(r.isWin).toBe(false)
    expect(r.winnerId).toBeNull()
  })
})

// --- decision & jail-skip builders + pure helpers --------------------------

describe('decision / jail-skip builders and helpers', () => {
  it('builds buy / decline decisions from the pending buy', () => {
    const state = makeState([player(0, 0, 1500)], { pendingBuy: { seat: 0, tile: 4, price: 300 } })
    expect(resolveBuyDecision(state)).toEqual({ type: 'decision', seat: 0, tile: 4, action: 'buy', price: 300 })
    expect(resolveDecline(state)).toEqual({ type: 'decision', seat: 0, tile: 4, action: 'decline', price: 300 })
  })

  it('builds a jail skip for a seat', () => {
    expect(buildJailSkip(2)).toEqual({ type: 'jailSkip', seat: 2 })
  })

  it('rentFor honours mortgage and level; helpers read state', () => {
    expect(rentFor(BOARD[1], own(1))).toBe(rentOf(1))
    expect(rentFor(BOARD[1], { owner: 1, level: 0, mortgaged: true })).toBe(0)
    const state = makeState([player(0, 0, 1000)], { ownership: { 1: own(0), 4: own(0) } })
    expect(netWorth(0, state)).toBe(1000 + priceOf(1) + priceOf(4))
    expect(canAfford(0, 1000, [1000])).toBe(true)
    expect(canAfford(0, 1001, [1000])).toBe(false)
  })
})

// --- doubles (P2) ----------------------------------------------------------

describe('resolveTurn — doubles → extra turn / third → jail (P2)', () => {
  const two = () => makeState([player(0, 0, 1500), player(1, 0, 1500)])

  it('grants an extra turn on doubles with the running count', () => {
    const r = roll(two(), d(2, 2)) // 0 → 4 (Beirut), doubles
    expect(r.extraTurn).toBe(true)
    expect(r.doublesCount).toBe(1)
  })

  it('grants no extra turn on a non-doubles roll', () => {
    const r = roll(two(), d(2, 3))
    expect(r.extraTurn).toBe(false)
    expect(r.doublesCount).toBe(0)
  })

  it('sends the third consecutive double straight to jail without moving', () => {
    const r = roll(makeState([player(0, 5, 1500), player(1, 0, 1500)], { consecutiveDoubles: 2 }), d(3, 3))
    expect(r.doublesCount).toBe(3)
    expect(r.extraTurn).toBe(false)
    expect(only(r.effects, 'move')).toHaveLength(0)
    expect(only(r.effects, 'jail')[0]).toMatchObject({ seat: 0 })
    expect(r.finalTile).toBe(JAIL_TILE)
    expect(r.buyOption).toBeNull()
  })

  it('honours the doubles toggle (off = no extra turn)', () => {
    const r = roll(
      makeState([player(0, 0, 1500), player(1, 0, 1500)], {
        rules: { ...DEFAULT_BANK_RULES, doubles: false },
      }),
      d(2, 2),
    )
    expect(r.extraTurn).toBe(false)
    expect(r.doublesCount).toBe(0)
  })
})

// --- full-group double rent (P2) -------------------------------------------

describe('resolveTurn — full-group double rent (P2)', () => {
  // Color group A = tiles 4, 5, 6 (Beirut / Riyadh / Baghdad).
  it('doubles the rent when the owner holds the whole color group', () => {
    const state = makeState([player(0, 3, 1500), player(1, 0, 1500)], {
      ownership: { 4: own(1), 5: own(1), 6: own(1) },
    })
    const r = roll(state, d(1, 1)) // 3 → 5, all of A owned by seat 1
    expect(only(r.effects, 'pay')[0]).toMatchObject({ from: 0, to: 1, amount: rentOf(5) * 2, reason: 'rent' })
  })

  it('charges single rent while the group is incomplete', () => {
    const state = makeState([player(0, 3, 1500), player(1, 0, 1500)], {
      ownership: { 4: own(1), 5: own(1) }, // missing tile 6
    })
    const r = roll(state, d(1, 1)) // 3 → 5
    expect(only(r.effects, 'pay')[0].amount).toBe(rentOf(5))
  })
})

// --- richer jail (P2) ------------------------------------------------------

describe('resolveTurn — richer jail (P2)', () => {
  const jailed = (cash: number, extra: Partial<BankPlayer> = {}) =>
    makeState([player(0, JAIL_TILE, cash, { jailTurns: 3, ...extra }), player(1, 0, 1500)])
  const rollJail = (state: BankGameState, dice: [DieValue, DieValue], jailIntent: 'roll' | 'payFine' | 'useCard') => {
    const r = resolveTurn({ state, dice, jailIntent })
    if (r.type !== 'roll') throw new Error('expected a roll resolution')
    return r
  }

  it('a jailed player who rolls doubles walks free and moves, with no extra turn', () => {
    const r = roll(jailed(1500), d(2, 2)) // doubles → escape, move 4 → tile 28
    expect(only(r.effects, 'jailRelease')[0]).toMatchObject({ seat: 0, via: 'doubles' })
    expect(r.extraTurn).toBe(false)
    expect(r.finalTile).toBe(28)
  })

  it('a failed roll with attempts to spare stays in jail (no move)', () => {
    const r = roll(jailed(1500), d(1, 3))
    expect(only(r.effects, 'jailStay')[0]).toMatchObject({ seat: 0 })
    expect(only(r.effects, 'move')).toHaveLength(0)
    expect(r.finalTile).toBe(JAIL_TILE)
  })

  it('the final attempt forces the fine, then moves', () => {
    const r = roll(jailed(1500, { jailTurns: 1 }), d(1, 3)) // not doubles, last try → forced
    expect(only(r.effects, 'cash')[0]).toMatchObject({ delta: -50, reason: 'jailFine' })
    expect(only(r.effects, 'jailRelease')[0]).toMatchObject({ via: 'forced' })
    expect(r.finalTile).toBe(28)
  })

  it('paying the fine leaves jail and moves the roll', () => {
    const r = rollJail(jailed(1500), d(1, 3), 'payFine')
    expect(only(r.effects, 'cash')[0]).toMatchObject({ delta: -50, reason: 'jailFine' })
    expect(only(r.effects, 'jailRelease')[0]).toMatchObject({ via: 'fine' })
    expect(r.finalTile).toBe(28)
  })

  it('spending a kept card leaves jail for free and moves', () => {
    const r = rollJail(jailed(1500, { jailCards: 1 }), d(1, 3), 'useCard')
    expect(only(r.effects, 'jailRelease')[0]).toMatchObject({ via: 'card' })
    expect(only(r.effects, 'cash')).toHaveLength(0) // no fine
    expect(r.finalTile).toBe(28)
  })

  it('a forced fine the player cannot afford bankrupts them', () => {
    const r = roll(jailed(10, { jailTurns: 1 }), d(1, 3)) // fine 50 > 10 cash
    expect(only(r.effects, 'bankrupt')).toHaveLength(1)
    expect(r.isWin).toBe(true)
    expect(r.winnerId).toBe(1)
  })

  it('a Get-Out-of-Jail card is banked on the seat', () => {
    const r = roll(makeState([player(0, 1, 1500), player(1, 0, 1500)]), d(1, 1), draws('luck', 'getOutOfJail'))
    expect(only(r.effects, 'grantJailCard')[0]).toMatchObject({ seat: 0 })
  })
})

// --- property upgrades (P3) ------------------------------------------------

const ownAt = (owner: number, level: number, mortgaged = false): Ownership => ({ owner, level, mortgaged })

describe('resolveTurn — building upgrades raise the rent (P3)', () => {
  // Color group A = tiles 4, 5, 6. Landing on a built-up rival tile pays its
  // level rent, not the (doubled) base.
  it('charges the level rent when the property carries houses', () => {
    const state = makeState([player(0, 3, 1500), player(1, 0, 1500)], {
      ownership: { 4: ownAt(1, 3), 5: own(1), 6: own(1) },
    })
    const r = roll(state, d(1, 1)) // 3 → 5 (level 0) — sanity: still base rent
    expect(only(r.effects, 'pay')[0].amount).toBe(rentOf(5) * 2) // full group, no houses → ×2

    const onHouses = makeState([player(0, 2, 1500), player(1, 0, 1500)], {
      ownership: { 4: ownAt(1, 3), 5: own(1), 6: own(1) },
    })
    const hit = roll(onHouses, d(1, 1)) // 2 → 4 (level 3)
    expect(only(hit.effects, 'pay')[0].amount).toBe(BOARD[4].rentByLevel![3])
  })
})

describe('property upgrades — predicates and builders (P3)', () => {
  const groupA = () => ({ 4: own(0), 5: own(0), 6: own(0) }) // Beirut / Riyadh / Baghdad

  it('allows building only with the full group, affordably, and not on a utility', () => {
    const s = makeState([player(0, 0, 1500), player(1, 0, 1500)], { ownership: groupA() })
    expect(canBuildHouse(s, 0, 4)).toBe(true)

    const partial = makeState([player(0, 0, 1500)], { ownership: { 4: own(0), 5: own(0) } })
    expect(canBuildHouse(partial, 0, 6)).toBe(false)

    const utils = makeState([player(0, 0, 1500)], { ownership: { 15: own(0) } })
    expect(canBuildHouse(utils, 0, 15)).toBe(false) // the petrol utility is unimprovable

    const broke = makeState([player(0, 0, 10)], { ownership: groupA() })
    expect(canBuildHouse(broke, 0, 4)).toBe(false)
  })

  it('enforces even building (raise the group minimum first) and caps at a hotel', () => {
    const uneven = makeState([player(0, 0, 1500)], { ownership: { 4: ownAt(0, 1), 5: own(0), 6: own(0) } })
    expect(canBuildHouse(uneven, 0, 4)).toBe(false) // already above the group min
    expect(canBuildHouse(uneven, 0, 5)).toBe(true)

    const maxed = makeState([player(0, 0, 1500)], { ownership: { 4: ownAt(0, 4), 5: ownAt(0, 4), 6: ownAt(0, 4) } })
    expect(canBuildHouse(maxed, 0, 4)).toBe(false)
  })

  it('builds a manage resolution with the new level and house cost', () => {
    const s = makeState([player(0, 0, 1500)], { ownership: groupA() })
    expect(buildUpgrade(s, 4)).toEqual({
      type: 'manage',
      seat: 0,
      effects: [{ kind: 'upgrade', seat: 0, tile: 4, level: 1, cost: houseCost(BOARD[4]) }],
    })
  })

  it('sells only from the group maximum, refunding half the house cost', () => {
    const s = makeState([player(0, 0, 1500)], { ownership: { 4: ownAt(0, 2), 5: ownAt(0, 1), 6: ownAt(0, 1) } })
    expect(canSellHouse(s, 0, 4)).toBe(true)
    expect(canSellHouse(s, 0, 5)).toBe(false)
    expect(buildSell(s, 4)).toEqual({
      type: 'manage',
      seat: 0,
      effects: [{ kind: 'sell', seat: 0, tile: 4, level: 1, refund: sellRefund(BOARD[4]) }],
    })
  })
})

// --- mortgage (P4) ---------------------------------------------------------

describe('mortgage — predicates and builders (P4)', () => {
  it('mortgages an unimproved owned property and blocks re-mortgage', () => {
    const s = makeState([player(0, 0, 1500)], { ownership: { 4: own(0) } })
    expect(canMortgage(s, 0, 4)).toBe(true)
    expect(buildMortgage(s, 4)).toEqual({
      type: 'manage',
      seat: 0,
      effects: [{ kind: 'mortgage', seat: 0, tile: 4, amount: mortgageValue(BOARD[4]) }],
    })
    const already = makeState([player(0, 0, 1500)], { ownership: { 4: ownAt(0, 0, true) } })
    expect(canMortgage(already, 0, 4)).toBe(false)
  })

  it('refuses to mortgage while the group carries houses', () => {
    const s = makeState([player(0, 0, 1500)], { ownership: { 4: own(0), 5: ownAt(0, 1) } })
    expect(canMortgage(s, 0, 4)).toBe(false)
  })

  it('lifts a mortgage for the principal + interest when affordable', () => {
    const s = makeState([player(0, 0, 1500)], { ownership: { 4: ownAt(0, 0, true) } })
    expect(canUnmortgage(s, 0, 4)).toBe(true)
    expect(unmortgageCost(BOARD[4])).toBe(Math.round(mortgageValue(BOARD[4]) * 1.1))
    expect(buildUnmortgage(s, 4)).toEqual({
      type: 'manage',
      seat: 0,
      effects: [{ kind: 'unmortgage', seat: 0, tile: 4, cost: unmortgageCost(BOARD[4]) }],
    })
    const broke = makeState([player(0, 0, 5)], { ownership: { 4: ownAt(0, 0, true) } })
    expect(canUnmortgage(broke, 0, 4)).toBe(false)
  })

  it('collects no rent on a mortgaged property', () => {
    const state = makeState([player(0, 32, 1500), player(1, 0, 1500)], {
      ownership: { 1: ownAt(1, 0, true) },
    })
    const r = roll(state, d(1, 2)) // → tile 1, owned by seat 1 but mortgaged
    expect(only(r.effects, 'pay')).toHaveLength(0)
    expect(r.buyOption).toBeNull()
  })
})

// --- trading (P4) ----------------------------------------------------------

describe('trading — validity and builder (P4)', () => {
  const base = () =>
    makeState([player(0, 0, 1500), player(1, 0, 1500)], { ownership: { 4: own(0), 21: own(1) } })

  it('accepts a legal property-for-property trade', () => {
    const offer: TradeOffer = { from: 0, to: 1, giveTiles: [4], giveCash: 0, receiveTiles: [21], receiveCash: 0 }
    expect(canTrade(base(), offer)).toBe(true)
    expect(buildTrade(offer)).toEqual({ type: 'trade', ...offer })
  })

  it('rejects an unowned give, an empty offer, and unaffordable cash', () => {
    expect(canTrade(base(), { from: 0, to: 1, giveTiles: [21], giveCash: 0, receiveTiles: [], receiveCash: 0 })).toBe(false)
    expect(canTrade(base(), { from: 0, to: 1, giveTiles: [], giveCash: 0, receiveTiles: [], receiveCash: 0 })).toBe(false)
    expect(canTrade(base(), { from: 0, to: 1, giveTiles: [], giveCash: 5000, receiveTiles: [], receiveCash: 0 })).toBe(false)
  })

  it('refuses to trade a tile whose group carries houses', () => {
    const s = makeState([player(0, 0, 1500), player(1, 0, 1500)], {
      ownership: { 4: own(0), 5: ownAt(0, 1), 21: own(1) },
    })
    expect(canTrade(s, { from: 0, to: 1, giveTiles: [4], giveCash: 0, receiveTiles: [21], receiveCash: 0 })).toBe(false)
  })
})
