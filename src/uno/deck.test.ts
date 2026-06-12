import { describe, it, expect } from 'vitest'
import { buildDeck, shuffle, deal, reshuffleDiscard } from './deck'
import { UNO_COLORS, HAND_SIZE } from './config'
import type { UnoCard } from './types'

const key = (c: UnoCard) => `${c.color ?? 'wild'}-${c.value}`
const tally = (cards: UnoCard[]) => {
  const m = new Map<string, number>()
  for (const c of cards) m.set(key(c), (m.get(key(c)) ?? 0) + 1)
  return m
}
const order = (cards: UnoCard[]) => cards.map((c) => c.id).join(',')

describe('buildDeck', () => {
  const deck = buildDeck()

  it('has exactly 108 cards', () => {
    expect(deck).toHaveLength(108)
  })

  it('has unique ids u0..u107', () => {
    expect(new Set(deck.map((c) => c.id)).size).toBe(108)
    expect(deck[0].id).toBe('u0')
    expect(deck[107].id).toBe('u107')
  })

  it('has the correct multiplicities per color', () => {
    const t = tally(deck)
    for (const color of UNO_COLORS) {
      expect(t.get(`${color}-0`)).toBe(1)
      for (let n = 1; n <= 9; n++) expect(t.get(`${color}-${n}`)).toBe(2)
      expect(t.get(`${color}-skip`)).toBe(2)
      expect(t.get(`${color}-reverse`)).toBe(2)
      expect(t.get(`${color}-draw2`)).toBe(2)
    }
    expect(t.get('wild-wild')).toBe(4)
    expect(t.get('wild-wild4')).toBe(4)
  })

  it('scores to the canonical total (number faces + 20×action + 50×wild)', () => {
    // 4 colors: faces 0+2(1..9)=2*45=90, +0 → 90; actions 6×20=120; per color 210.
    // 4×210 = 840; wilds 8×50 = 400; total 1240 — the well-known full-deck value.
    const value = (c: UnoCard) =>
      typeof c.value === 'number'
        ? c.value
        : c.value === 'wild' || c.value === 'wild4'
          ? 50
          : 20
    expect(deck.reduce((s, c) => s + value(c), 0)).toBe(1240)
  })
})

describe('shuffle', () => {
  it('is deterministic: same seed → identical order', () => {
    expect(order(shuffle(12345))).toBe(order(shuffle(12345)))
  })

  it('different seeds generally differ', () => {
    expect(order(shuffle(1))).not.toBe(order(shuffle(2)))
  })

  it('is a permutation of the canonical deck (same multiset)', () => {
    const t = tally(shuffle(99))
    const base = tally(buildDeck())
    expect(t).toEqual(base)
    expect(shuffle(99)).toHaveLength(108)
  })
})

describe('deal', () => {
  it.each([2, 3, 4, 5, 6])('gives %i players a 7-card hand and conserves all 108', (n) => {
    const { hands, stock, startCard } = deal(shuffle(7), n)
    expect(hands).toHaveLength(n)
    for (const hand of hands) expect(hand).toHaveLength(HAND_SIZE)
    expect(hands.flat().length + stock.length + 1).toBe(108)
    expect(startCard).toBeDefined()
  })

  it('never starts on a Wild-Draw-Four', () => {
    // Sweep many seeds; any flipped WD4 must be buried and re-flipped.
    for (let seed = 0; seed < 300; seed++) {
      expect(deal(shuffle(seed), 4).startCard.value).not.toBe('wild4')
    }
  })

  it('is deterministic for a given seed and player count', () => {
    const a = deal(shuffle(42), 4)
    const b = deal(shuffle(42), 4)
    expect(a.hands.map(order)).toEqual(b.hands.map(order))
    expect(order(a.stock)).toBe(order(b.stock))
    expect(a.startCard.id).toBe(b.startCard.id)
  })

  it('does not mutate the input stock', () => {
    const stock = shuffle(5)
    const before = order(stock)
    deal(stock, 4)
    expect(order(stock)).toBe(before)
  })
})

describe('reshuffleDiscard', () => {
  it('keeps the top card and reshuffles the rest', () => {
    const discard = shuffle(3).slice(0, 30)
    const top = discard[discard.length - 1]
    const { stock, discard: rest } = reshuffleDiscard(discard, 1)
    expect(rest).toEqual([top])
    expect(stock).toHaveLength(29)
    expect(new Set(stock.map((c) => c.id))).not.toContain(top.id)
  })

  it('is deterministic across clients: same discard + counter → same stock', () => {
    const discard = shuffle(8).slice(0, 40)
    // Two clients may hold the discard in different array order; the result must
    // depend only on the counter, not on input order.
    const shuffledInput = [...discard.slice(0, -1)].reverse().concat(discard[discard.length - 1])
    const a = reshuffleDiscard(discard, 2)
    const b = reshuffleDiscard(shuffledInput, 2)
    expect(order(a.stock)).toBe(order(b.stock))
  })

  it('different counters give different stocks', () => {
    const discard = shuffle(8).slice(0, 40)
    expect(order(reshuffleDiscard(discard, 1).stock)).not.toBe(
      order(reshuffleDiscard(discard, 2).stock),
    )
  })

  it('handles a discard of one card (nothing to reshuffle)', () => {
    const one = shuffle(1).slice(0, 1)
    expect(reshuffleDiscard(one, 1)).toEqual({ stock: [], discard: one })
  })
})
