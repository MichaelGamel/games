import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bankReducer, initialBankState, type PlayerSetup } from './bankReducer'
import { clearBankGame, loadBankGame, pickBankState, saveBankGame } from './save'
import type { BankGameState, BankTurnResolution } from './types'

const PLAYERS: PlayerSetup[] = [
  { name: 'A', color: '#f00' },
  { name: 'B', color: '#0f0' },
]

const start = () => bankReducer(initialBankState, { type: 'START_GAME', players: PLAYERS })

// A mid-match state: rolled once, idle on the next seat.
const midMatch = (): BankGameState => {
  const roll: BankTurnResolution = {
    type: 'roll',
    seat: 0,
    dice: [2, 3],
    usedFastBus: false,
    effects: [{ kind: 'move', from: 0, to: 5, path: [1, 2, 3, 4, 5], passedStart: false }],
    finalTile: 5,
    buyOption: null,
    isWin: false,
    winnerId: null,
  }
  return bankReducer(start(), { type: 'COMMIT_TURN', resolution: roll })
}

// In-memory localStorage so storage.ts works under the node test env.
beforeEach(() => {
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  }
})
afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window
})

describe('bank save/load', () => {
  it('pickBankState keeps only committed state fields', () => {
    const state = midMatch()
    const picked = pickBankState({ ...state, extra: 1 } as unknown as BankGameState)
    expect(picked.turnCount).toBe(state.turnCount)
    expect(Object.keys(picked).sort()).toEqual(
      [
        'bankruptedOrder',
        'consecutiveDoubles',
        'currentPlayerIndex',
        'lastDice',
        'ownership',
        'pendingBuy',
        'phase',
        'players',
        'round',
        'rules',
        'turnCount',
        'winnerId',
        'winReason',
      ].sort(),
    )
  })

  it('round-trips a mid-match save', () => {
    const state = midMatch()
    saveBankGame(state, null, 1234)
    const loaded = loadBankGame()
    expect(loaded).not.toBeNull()
    expect(loaded!.savedAt).toBe(1234)
    expect(loaded!.state.turnCount).toBe(state.turnCount)
    expect(loaded!.state.players).toHaveLength(2)
  })

  it('does not resume a finished match', () => {
    const won: BankGameState = { ...midMatch(), phase: 'won', winnerId: 0 }
    saveBankGame(won, null, 1)
    expect(loadBankGame()).toBeNull()
  })

  it('does not resume a setup state', () => {
    saveBankGame(initialBankState, null, 1)
    expect(loadBankGame()).toBeNull()
  })

  it('clear removes the save', () => {
    saveBankGame(midMatch(), null, 1)
    clearBankGame()
    expect(loadBankGame()).toBeNull()
  })
})
