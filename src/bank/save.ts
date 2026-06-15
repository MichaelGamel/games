/**
 * Local persistence for an in-progress Bank El-Hazz match (pass-and-play only).
 *
 * The whole committed {@link BankGameState} plus the recap/replay {@link MatchLog}
 * are written to localStorage after every settled turn, so closing the tab mid
 * match never loses progress — the menu offers to resume. Online matches are
 * never saved (they self-heal via the net layer's snapshots instead). Goes
 * through {@link storage} so private-mode / quota failures degrade silently.
 */
import { loadLocal, saveLocal } from '../lib/storage'
import type { MatchLog } from '../lib/matchLog'
import type { BankGameState, BankRules, BankTurnResolution } from './types'

export type BankMatchLog = MatchLog<BankTurnResolution, BankRules>

const KEY = 'rg-bank-save-v1'
const VERSION = 1 as const

export interface SavedBankGame {
  version: typeof VERSION
  savedAt: number
  state: BankGameState
  log: BankMatchLog | null
}

/** Keep only the committed state fields (never derived/transient controller bits). */
export function pickBankState(s: BankGameState): BankGameState {
  return {
    players: s.players,
    ownership: s.ownership,
    currentPlayerIndex: s.currentPlayerIndex,
    phase: s.phase,
    rules: s.rules,
    lastDice: s.lastDice,
    pendingBuy: s.pendingBuy,
    pendingChoice: s.pendingChoice,
    bankruptedOrder: s.bankruptedOrder,
    winnerId: s.winnerId,
    winReason: s.winReason,
    consecutiveDoubles: s.consecutiveDoubles,
    round: s.round,
    turnCount: s.turnCount,
  }
}

/** Persist the current match (called after each settled turn). `savedAt` is
 *  passed in so this module stays free of `Date.now()` for testability. */
export function saveBankGame(state: BankGameState, log: BankMatchLog | null, savedAt: number): void {
  saveLocal<SavedBankGame>(KEY, { version: VERSION, savedAt, state: pickBankState(state), log })
}

/** The saved in-progress match, or null if there is none / it is unusable. */
export function loadBankGame(): SavedBankGame | null {
  const saved = loadLocal<SavedBankGame | null>(KEY, null)
  if (!saved || saved.version !== VERSION) return null
  const s = saved.state
  // A finished or empty match isn't resumable.
  if (!s || !Array.isArray(s.players) || s.players.length < 2) return null
  if (s.phase === 'won' || s.phase === 'setup') return null
  return saved
}

/** Drop the saved match (a new game started, the match ended, or it was discarded). */
export function clearBankGame(): void {
  saveLocal<SavedBankGame | null>(KEY, null)
}
