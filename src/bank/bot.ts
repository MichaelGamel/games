/**
 * Computer-player decisions for Bank El-Hazz — pure and deterministic (no React,
 * no randomness), so they are unit-testable and a bot would behave identically on
 * every client if it ever ran remotely.
 *
 * A bot acts exactly like a human: the rules engine and reducer never branch on
 * `isBot`. The only choices a Bank turn needs are made here — chiefly the
 * buy/skip pause that opens when a bot lands on an unowned, affordable property.
 * Rolling (including escaping jail by rolling for doubles) needs no decision, so
 * the autoplay hook just calls `roll()`.
 *
 * Three difficulty tiers, by how much cash they keep in reserve and how keenly
 * they chase color sets:
 *   - `easy`   — buys almost anything it can afford (a tiny safety float).
 *   - `medium` — keeps a healthy reserve, but always grabs set-completing lots.
 *   - `hard`   — values color sets, blocks rivals' sets, and won't over-commit
 *     its cash to a single lot.
 */
import { BOARD, PROPERTY_GROUPS } from './config'
import type { BankGameState } from './types'

export type BotLevel = 'easy' | 'medium' | 'hard'

/** Cash a bot tries to keep on hand after a purchase, by difficulty. */
const RESERVE: Record<BotLevel, number> = { easy: 60, medium: 220, hard: 320 }
/** Hard bots won't sink more than this fraction of their cash into one lot. */
const MAX_SPEND_FRACTION = 0.7

/** Would buying `tile` give `seat` every property in its color group? */
function wouldCompleteGroup(state: BankGameState, seat: number, tile: number): boolean {
  const group = BOARD[tile].group
  if (!group) return false
  const ids = PROPERTY_GROUPS[group]
  if (!ids || ids.length < 2) return false
  return ids.every((id) => id === tile || state.ownership[id]?.owner === seat)
}

/** Does `seat` already hold at least one other property in `tile`'s group? */
function hasFootholdInGroup(state: BankGameState, seat: number, tile: number): boolean {
  const group = BOARD[tile].group
  if (!group) return false
  return (PROPERTY_GROUPS[group] ?? []).some((id) => id !== tile && state.ownership[id]?.owner === seat)
}

/** Would buying `tile` deny a rival who already owns the rest of its group? */
function wouldBlockRivalSet(state: BankGameState, seat: number, tile: number): boolean {
  const group = BOARD[tile].group
  if (!group) return false
  const others = (PROPERTY_GROUPS[group] ?? []).filter((id) => id !== tile)
  if (others.length === 0) return false
  // Some single rival owns every other tile in the group → this lot blocks them.
  const owner = state.ownership[others[0]]?.owner
  if (owner == null || owner === seat) return false
  return others.every((id) => state.ownership[id]?.owner === owner)
}

/**
 * Decide whether `seat` buys the property at `tile` for `price`. Deterministic —
 * given the same state and level, always the same answer. `buyOption` is only
 * ever offered when the seat can already afford it, so `price <= cash` holds.
 */
export function chooseBuyDecision(
  state: BankGameState,
  seat: number,
  tile: number,
  price: number,
  level: BotLevel,
): 'buy' | 'decline' {
  const cash = state.players[seat]?.cash ?? 0
  if (price > cash) return 'decline'
  const after = cash - price
  const reserve = RESERVE[level]

  // Completing a color set (double rent) is always worth a thin reserve.
  if (wouldCompleteGroup(state, seat, tile)) return after >= 0 ? 'buy' : 'decline'

  if (level === 'easy') return after >= reserve ? 'buy' : 'decline'

  // Hard bots block a rival about to complete a set, even at a slim reserve.
  if (level === 'hard' && wouldBlockRivalSet(state, seat, tile)) {
    return after >= 0 ? 'buy' : 'decline'
  }

  // Extending a group we already have a foothold in is worth a normal reserve.
  if (hasFootholdInGroup(state, seat, tile)) return after >= reserve ? 'buy' : 'decline'

  // A fresh lot: keep the reserve, and (hard) don't over-commit to one property.
  if (after < reserve) return 'decline'
  if (level === 'hard' && price > cash * MAX_SPEND_FRACTION) return 'decline'
  return 'buy'
}
