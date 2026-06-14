import { describe, expect, it } from 'vitest'
import { bankReducer, initialBankState, type PlayerSetup } from './bankReducer'
import { chooseBuyDecision } from './bot'
import { BOARD, PROPERTY_GROUPS } from './config'
import type { BankGameState, Ownership } from './types'

const PLAYERS: PlayerSetup[] = [
  { name: 'A', color: '#f00' },
  { name: 'B', color: '#0f0' },
]

const start = (): BankGameState => bankReducer(initialBankState, { type: 'START_GAME', players: PLAYERS })

/** A state with a given seat's cash and an ownership map. */
const withState = (cash: number[], ownership: Record<number, Ownership> = {}): BankGameState => {
  const s = start()
  return {
    ...s,
    players: s.players.map((p) => ({ ...p, cash: cash[p.id] ?? p.cash })),
    ownership,
  }
}

const own = (owner: number): Ownership => ({ owner, level: 0, mortgaged: false })

// Pick a real property tile and a sibling in its group from the live board.
const groupA = PROPERTY_GROUPS['A'] // three pink cities
const tileA0 = groupA[0]
const tileA1 = groupA[1]
const tileA2 = groupA[2]
const priceA0 = BOARD[tileA0].price ?? 100

describe('chooseBuyDecision', () => {
  it('declines when it cannot afford the lot', () => {
    const state = withState([10])
    expect(chooseBuyDecision(state, 0, tileA0, priceA0, 'easy')).toBe('decline')
  })

  it('easy buys almost anything affordable (thin reserve)', () => {
    const state = withState([priceA0 + 60])
    expect(chooseBuyDecision(state, 0, tileA0, priceA0, 'easy')).toBe('buy')
  })

  it('medium keeps a healthy reserve on a fresh lot', () => {
    // Just enough to buy, but reserve (220) not met afterwards.
    const rich = withState([priceA0 + 100])
    expect(chooseBuyDecision(rich, 0, tileA0, priceA0, 'medium')).toBe('decline')
    const richer = withState([priceA0 + 300])
    expect(chooseBuyDecision(richer, 0, tileA0, priceA0, 'medium')).toBe('buy')
  })

  it('always grabs a set-completing lot, even on a thin reserve', () => {
    // Seat 0 owns the other two of group A; buying the third completes the set.
    const ownership = { [tileA1]: own(0), [tileA2]: own(0) }
    const state = withState([priceA0 + 5], ownership)
    expect(chooseBuyDecision(state, 0, tileA0, priceA0, 'medium')).toBe('buy')
    expect(chooseBuyDecision(state, 0, tileA0, priceA0, 'hard')).toBe('buy')
  })

  it('hard blocks a rival who owns the rest of the group', () => {
    // Seat 1 owns the other two of group A; seat 0 buying the third blocks them.
    const ownership = { [tileA1]: own(1), [tileA2]: own(1) }
    const state = withState([priceA0 + 10], ownership)
    expect(chooseBuyDecision(state, 0, tileA0, priceA0, 'hard')).toBe('buy')
  })

  it('hard will not over-commit its cash to a single fresh lot', () => {
    // Can afford with a big reserve, but the lot is >70% of cash → decline.
    const state = withState([Math.ceil(priceA0 / 0.6)])
    expect(chooseBuyDecision(state, 0, tileA0, priceA0, 'hard')).toBe('decline')
  })

  it('is deterministic — same inputs, same answer', () => {
    const state = withState([priceA0 + 400])
    const a = chooseBuyDecision(state, 0, tileA0, priceA0, 'hard')
    const b = chooseBuyDecision(state, 0, tileA0, priceA0, 'hard')
    expect(a).toBe(b)
  })
})
