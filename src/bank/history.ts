/**
 * Local match history for Bank El-Hazz — a short, persisted log of finished
 * matches (winner, turns, and each player's final cash / properties / rent),
 * distilled from the match's {@link MatchLog} via {@link summarizeBank}. Shown on
 * the menu so a couch group can look back over recent games. Capped and stored
 * through {@link storage}, so it degrades silently when storage is unavailable.
 */
import { loadLocal, saveLocal } from '../lib/storage'
import { summarizeBank } from './recap'
import type { BankMatchLog } from './save'

const KEY = 'rg-bank-history-v1'
const VERSION = 1 as const
/** Keep only the most recent matches — this is a quick look-back, not an archive. */
const MAX_ENTRIES = 20

export interface BankHistoryPlayer {
  name: string
  color: string
  bankrupt: boolean
  finalCash: number
  propertiesBought: number
  rentCollected: number
}

export interface BankHistoryEntry {
  /** Epoch ms the match finished. */
  playedAt: number
  totalTurns: number
  winnerName: string | null
  players: BankHistoryPlayer[]
}

interface BankHistoryStore {
  version: typeof VERSION
  entries: BankHistoryEntry[]
}

/** Distil a finished match's log into a history entry. `playedAt` is passed in
 *  so this stays free of `Date.now()` for testability. */
export function buildBankHistoryEntry(
  log: BankMatchLog,
  winnerId: number | null,
  playedAt: number,
): BankHistoryEntry {
  const recap = summarizeBank(log)
  return {
    playedAt,
    totalTurns: recap.totalTurns,
    winnerName: winnerId != null ? (recap.players[winnerId]?.name ?? null) : null,
    players: recap.players.map((p) => ({
      name: p.name,
      color: p.color,
      bankrupt: p.bankrupt,
      finalCash: p.finalCash,
      propertiesBought: p.propertiesBought,
      rentCollected: p.rentCollected,
    })),
  }
}

function loadStore(): BankHistoryStore {
  const store = loadLocal<BankHistoryStore | null>(KEY, null)
  if (!store || store.version !== VERSION || !Array.isArray(store.entries)) {
    return { version: VERSION, entries: [] }
  }
  return store
}

/** Prepend a finished match (newest first), keeping at most {@link MAX_ENTRIES}. */
export function recordBankMatch(entry: BankHistoryEntry): void {
  const entries = [entry, ...loadStore().entries].slice(0, MAX_ENTRIES)
  saveLocal<BankHistoryStore>(KEY, { version: VERSION, entries })
}

/** Recent finished matches, newest first. */
export function loadBankHistory(): BankHistoryEntry[] {
  return loadStore().entries
}

export function clearBankHistory(): void {
  saveLocal<BankHistoryStore>(KEY, { version: VERSION, entries: [] })
}
