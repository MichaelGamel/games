import { describe, it, expect } from 'vitest'
import {
  cardScore,
  scoreHand,
  scoreRound,
  legalPlays,
  resolvePlay,
  resolveDraw,
  adjudicateChallenge,
  step,
} from './rules'
import { initialUnoState } from './unoReducer'
import { DEFAULT_UNO_RULES } from './config'
import type { UnoCard, UnoColor, UnoGameState, UnoRules, UnoValue } from './types'

let seq = 0
const card = (color: UnoColor | null, value: UnoValue): UnoCard => ({
  id: `c${seq++}`,
  color,
  value,
})

function gs(over: Partial<UnoGameState>): UnoGameState {
  return { ...initialUnoState, ...over }
}
const rules = (over: Partial<UnoRules> = {}): UnoRules => ({ ...DEFAULT_UNO_RULES, ...over })

describe('scoring', () => {
  it('scores number cards at face, actions at 20, wilds at 50', () => {
    expect(cardScore(card('red', 7))).toBe(7)
    expect(cardScore(card('red', 0))).toBe(0)
    expect(cardScore(card('blue', 'skip'))).toBe(20)
    expect(cardScore(card('green', 'reverse'))).toBe(20)
    expect(cardScore(card('yellow', 'draw2'))).toBe(20)
    expect(cardScore(card(null, 'wild'))).toBe(50)
    expect(cardScore(card(null, 'wild4'))).toBe(50)
  })

  it('sums a hand and a round (opponents only)', () => {
    expect(scoreHand([card('red', 9), card(null, 'wild'), card('blue', 'skip')])).toBe(79)
    const state = gs({
      players: [{ id: 0, name: 'A', color: '#a', isBot: false }, { id: 1, name: 'B', color: '#b', isBot: false }, { id: 2, name: 'C', color: '#c', isBot: false }],
      currentPlayerIndex: 0,
      hands: [[], [card('red', 5)], [card(null, 'wild4'), card('blue', 2)]],
    })
    // Winner is seat 0 (empty); opponents hold 5 + (50 + 2) = 57.
    expect(scoreRound(state)).toBe(57)
  })
})

describe('legalPlays', () => {
  const top = card('red', 5)
  const base = rules()

  it('matches by color, number, and action; wild is always legal', () => {
    const hand = [card('red', 2), card('blue', 5), card('green', 8), card(null, 'wild')]
    const legal = legalPlays(hand, top, 'red', 0, null, base)
    expect(legal.map((c) => c.value).sort()).toEqual([2, 5, 'wild'])
  })

  it('matches the active color after a wild, not the wild card itself', () => {
    const wildTop = card(null, 'wild')
    const hand = [card('green', 3), card('red', 9)]
    expect(legalPlays(hand, wildTop, 'green', 0, null, base).map((c) => c.value)).toEqual([3])
  })

  it('restricts Wild-Draw-Four to when no active-color card is held', () => {
    const withColor = [card('red', 1), card(null, 'wild4')]
    expect(legalPlays(withColor, top, 'red', 0, null, base).some((c) => c.value === 'wild4')).toBe(false)
    const withoutColor = [card('blue', 1), card(null, 'wild4')]
    expect(legalPlays(withoutColor, top, 'red', 0, null, base).some((c) => c.value === 'wild4')).toBe(true)
  })

  it('permits a WD4 bluff when the challenge rule is on', () => {
    const withColor = [card('red', 1), card(null, 'wild4')]
    const legal = legalPlays(withColor, top, 'red', 0, null, rules({ challengeWild4: true }))
    expect(legal.some((c) => c.value === 'wild4')).toBe(true)
  })

  it('blocks everything under a pending draw without stacking', () => {
    const hand = [card('red', 'draw2'), card('blue', 5)]
    expect(legalPlays(hand, top, 'red', 2, 'draw2', base)).toEqual([])
  })

  it('allows only same-type stacking under a pending draw', () => {
    const hand = [card('red', 'draw2'), card('blue', 5), card(null, 'wild4')]
    const legal = legalPlays(hand, top, 'red', 2, 'draw2', rules({ stacking: true }))
    expect(legal.map((c) => c.value)).toEqual(['draw2'])
  })
})

describe('resolvePlay', () => {
  const players4 = [0, 1, 2, 3].map((id) => ({ id, name: `P${id}`, color: '#000', isBot: false }))
  const handAt = (seat: number, cards: UnoCard[]) => {
    const hands: UnoCard[][] = [[], [], [], []]
    hands[seat] = cards
    return hands
  }

  it('advances one seat for a number card', () => {
    const c = card('red', 5)
    const state = gs({ players: players4, currentPlayerIndex: 1, hands: handAt(1, [c, card('blue', 2)]) })
    const r = resolvePlay(state, { cards: [c] })
    expect(r.effect.nextIndex).toBe(2)
    expect(r.effect.skipped).toBe(false)
    expect(r.effect.isRoundWin).toBe(false)
  })

  it('skips the next seat for a Skip', () => {
    const c = card('red', 'skip')
    const state = gs({ players: players4, currentPlayerIndex: 0, hands: handAt(0, [c, card('blue', 2)]) })
    const r = resolvePlay(state, { cards: [c] })
    expect(r.effect.skipped).toBe(true)
    expect(r.effect.nextIndex).toBe(2)
  })

  it('flips direction for a Reverse, and acts as Skip with two players', () => {
    const c = card('red', 'reverse')
    const four = gs({ players: players4, currentPlayerIndex: 1, hands: handAt(1, [c, card('blue', 2)]) })
    const r4 = resolvePlay(four, { cards: [c] })
    expect(r4.effect.reversed).toBe(true)
    expect(r4.effect.nextIndex).toBe(0)

    const two = gs({
      players: players4.slice(0, 2),
      currentPlayerIndex: 0,
      hands: [[c, card('blue', 2)], []],
    })
    const r2 = resolvePlay(two, { cards: [c] })
    expect(r2.effect.skipped).toBe(true)
    expect(r2.effect.nextIndex).toBe(0) // back to the player (opponent skipped)
  })

  it('sets a Draw-Two penalty on the next seat and passes the turn', () => {
    const c = card('red', 'draw2')
    const state = gs({ players: players4, currentPlayerIndex: 0, hands: handAt(0, [c, card('blue', 2)]) })
    const r = resolvePlay(state, { cards: [c] })
    expect(r.effect.penaltyDraw).toEqual({ seat: 1, count: 2 })
    expect(r.effect.skipped).toBe(false)
    expect(r.effect.nextIndex).toBe(1)
  })

  it('accumulates Draw-Two onto an existing pending (stacking)', () => {
    const c = card('green', 'draw2')
    const state = gs({
      players: players4,
      currentPlayerIndex: 1,
      pendingDraw: 2,
      pendingDrawType: 'draw2',
      hands: handAt(1, [c, card('blue', 2)]),
    })
    const r = resolvePlay(state, { cards: [c] })
    expect(r.effect.penaltyDraw).toEqual({ seat: 2, count: 4 })
  })

  it('carries the chosen color and a 4-card penalty for a Wild-Draw-Four', () => {
    const c = card(null, 'wild4')
    const state = gs({ players: players4, currentPlayerIndex: 0, hands: handAt(0, [c, card('blue', 2)]) })
    const r = resolvePlay(state, { cards: [c], chosenColor: 'green' })
    expect(r.chosenColor).toBe('green')
    expect(r.effect.penaltyDraw).toEqual({ seat: 1, count: 4 })
  })

  it('records seven-swap and zero-rotate under Seven-Zero', () => {
    const seven = card('red', 7)
    const sevenState = gs({
      players: players4,
      currentPlayerIndex: 0,
      rules: rules({ sevenZero: true }),
      hands: handAt(0, [seven, card('blue', 2)]),
    })
    expect(resolvePlay(sevenState, { cards: [seven], sevenSwapTarget: 2 }).effect.sevenSwapTarget).toBe(2)

    const zero = card('red', 0)
    const zeroState = gs({
      players: players4,
      currentPlayerIndex: 0,
      rules: rules({ sevenZero: true }),
      hands: handAt(0, [zero, card('blue', 2)]),
    })
    expect(resolvePlay(zeroState, { cards: [zero] }).effect.zeroRotate).toBe(true)
  })

  it('flags a round win when the last card is played', () => {
    const c = card('red', 5)
    const state = gs({ players: players4, currentPlayerIndex: 2, hands: handAt(2, [c]) })
    expect(resolvePlay(state, { cards: [c] }).effect.isRoundWin).toBe(true)
  })

  it('multi-play of Skips jumps over several seats', () => {
    const a = card('red', 'skip')
    const b = card('blue', 'skip')
    const state = gs({ players: players4, currentPlayerIndex: 0, hands: handAt(0, [a, b, card('green', 1)]) })
    const r = resolvePlay(state, { cards: [a, b] })
    expect(r.effect.nextIndex).toBe(3) // skip seats 1 and 2
  })
})

describe('resolveDraw', () => {
  const players = [0, 1].map((id) => ({ id, name: `P${id}`, color: '#000', isBot: false }))

  it('draws the whole pending for a penalty', () => {
    const state = gs({ players, currentPlayerIndex: 0, pendingDraw: 4, pendingDrawType: 'wild4', hands: [[], []] })
    expect(resolveDraw(state)).toEqual({ kind: 'draw', seat: 0, count: 4, thenPlay: null })
  })

  it('draws one for a voluntary draw, carrying an optional thenPlay', () => {
    const state = gs({ players, currentPlayerIndex: 1, hands: [[], []] })
    expect(resolveDraw(state)).toEqual({ kind: 'draw', seat: 1, count: 1 })
    const drawn = card('red', 5)
    expect(resolveDraw(state, { thenPlay: drawn })).toMatchObject({ count: 1, thenPlay: drawn })
  })
})

describe('adjudicateChallenge', () => {
  const players4 = [0, 1, 2, 3].map((id) => ({ id, name: `P${id}`, color: '#000', isBot: false }))

  it('catches a bluff: the WD4 player held the prior color → they draw 4', () => {
    const state = gs({
      players: players4,
      currentPlayerIndex: 1, // the challenger (next after the WD4 player)
      direction: 1,
      pendingDraw: 4,
      wild4Challenge: { by: 0, priorColor: 'red' },
      hands: [[card('red', 9), card('blue', 1)], [], [], []], // seat 0 still holds red
    })
    const r = adjudicateChallenge(state)
    expect(r.success).toBe(true)
    expect(r.penalty).toEqual({ seat: 0, count: 4 })
    expect(r.nextIndex).toBe(1) // challenger keeps the turn
  })

  it('fails when no bluff: the challenger draws the owed 4 plus 2', () => {
    const state = gs({
      players: players4,
      currentPlayerIndex: 1,
      direction: 1,
      pendingDraw: 4,
      wild4Challenge: { by: 0, priorColor: 'red' },
      hands: [[card('blue', 9), card('green', 1)], [], [], []], // seat 0 has no red
    })
    const r = adjudicateChallenge(state)
    expect(r.success).toBe(false)
    expect(r.penalty).toEqual({ seat: 1, count: 6 })
    expect(r.nextIndex).toBe(2) // challenger is skipped
  })
})

describe('step', () => {
  it('wraps in both directions', () => {
    expect(step(3, 1, 4, 1)).toBe(0)
    expect(step(0, -1, 4, 1)).toBe(3)
    expect(step(0, 1, 4, 2)).toBe(2)
  })
})
