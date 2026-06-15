import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildBankHistoryEntry,
  clearBankHistory,
  loadBankHistory,
  recordBankMatch,
  type BankHistoryEntry,
} from './history'
import type { BankMatchLog } from './save'

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

const log: BankMatchLog = {
  players: [
    { name: 'A', color: '#f00' },
    { name: 'B', color: '#0f0' },
  ],
  rules: { startCash: 1500, passStartReward: 200, diceCount: 2, doubles: true, jailFine: 50, maxRounds: null },
  events: [
    {
      kind: 'turn',
      seat: 0,
      resolution: {
        type: 'roll',
        seat: 0,
        dice: [2, 3],
        usedFastBus: false,
        effects: [
          { kind: 'move', from: 0, to: 5, path: [1, 2, 3, 4, 5], passedStart: false },
          { kind: 'pay', from: 0, to: 1, amount: 30, reason: 'rent' },
        ],
        finalTile: 5,
        buyOption: null,
        isWin: false,
        winnerId: null,
      },
    },
  ],
}

describe('bank history', () => {
  it('buildBankHistoryEntry distils the winner, turns, and per-player totals', () => {
    const entry = buildBankHistoryEntry(log, 1, 999)
    expect(entry.playedAt).toBe(999)
    expect(entry.totalTurns).toBe(1)
    expect(entry.winnerName).toBe('B')
    expect(entry.players[1].rentCollected).toBe(30)
    expect(entry.players[0].finalCash).toBe(1470) // 1500 − 30 rent
  })

  it('records newest-first and caps the list', () => {
    for (let i = 0; i < 25; i++) {
      recordBankMatch({ playedAt: i, totalTurns: i, winnerName: `W${i}`, players: [] })
    }
    const list = loadBankHistory()
    expect(list).toHaveLength(20)
    expect(list[0].winnerName).toBe('W24') // newest first
    expect(list[19].winnerName).toBe('W5') // oldest kept
  })

  it('clears the history', () => {
    recordBankMatch({ playedAt: 1, totalTurns: 1, winnerName: 'W', players: [] } as BankHistoryEntry)
    clearBankHistory()
    expect(loadBankHistory()).toEqual([])
  })
})
