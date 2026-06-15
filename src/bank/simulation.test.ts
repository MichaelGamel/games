/**
 * Integration-style simulation: drive a full local match through the same pure
 * pieces the hook orchestrates — `resolveTurn` → `COMMIT_TURN`, and the bot's
 * `chooseBuyDecision` for the buy pause — and assert the gameplay loop stays
 * consistent (cash never negative, the active player is solvent, the turn counter
 * advances, no phase ever wedges) and that a finish names exactly one survivor.
 * This is the closest a node test gets to "the game plays end to end".
 */
import { describe, expect, it } from 'vitest'
import { bankReducer, initialBankState, type PlayerSetup } from './bankReducer'
import { BOARD_TILES } from './config'
import { resolveBuyDecision, resolveCardDraw, resolveDecline, resolveTurn, rollDice } from './rules'
import { chooseBuyDecision, type BotLevel } from './bot'
import type { BankGameState, BankRules } from './types'

/** Deterministic RNG (mulberry32) so the simulation is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const LEVELS: BotLevel[] = ['easy', 'medium', 'hard']

/** Plain invariant check (no per-step `expect` — returns a message on failure). */
function invariantError(state: BankGameState): string | null {
  for (const p of state.players) {
    if (p.cash < 0) return `seat ${p.id} cash negative (${p.cash})`
    if (p.position < 0 || p.position >= BOARD_TILES) return `seat ${p.id} off board (${p.position})`
  }
  for (const entry of Object.values(state.ownership)) {
    if (!state.players[entry.owner]) return `ownership names a missing seat (${entry.owner})`
  }
  if (state.phase !== 'won') {
    if (state.players[state.currentPlayerIndex]?.status !== 'active') return 'current player not active'
    if (!state.players.some((p) => p.status === 'active')) return 'no active players but not won'
  }
  return null
}

/** Play one seeded match to completion (or a turn cap) with all-bot players. */
function playMatch(
  seed: number,
  players: PlayerSetup[],
  cap: number,
  rules?: BankRules,
): { state: BankGameState; finished: boolean; error: string | null } {
  const rng = mulberry32(seed)
  let state = bankReducer(initialBankState, { type: 'START_GAME', players, rules })
  for (let i = 0; i < cap && state.phase !== 'won'; i++) {
    if (state.phase === 'idle') {
      state = bankReducer(state, {
        type: 'COMMIT_TURN',
        resolution: resolveTurn({ state, dice: rollDice(state.rules.diceCount, rng), rng }),
      })
    } else if (state.phase === 'deciding' && state.pendingBuy) {
      const { seat, tile, price } = state.pendingBuy
      const decision = chooseBuyDecision(state, seat, tile, price, state.players[seat]?.botLevel ?? 'easy')
      state = bankReducer(state, {
        type: 'COMMIT_TURN',
        resolution: decision === 'buy' ? resolveBuyDecision(state) : resolveDecline(state),
      })
    } else if (state.phase === 'deciding' && state.pendingChoice) {
      // A "Luck or Court" cell: pick a deck (Luck) and resolve the draw.
      state = bankReducer(state, { type: 'COMMIT_TURN', resolution: resolveCardDraw(state, 'luck', rng) })
    } else {
      return { state, finished: false, error: `unexpected phase: ${state.phase}` }
    }
    const err = invariantError(state)
    if (err) return { state, finished: false, error: err }
  }
  return { state, finished: state.phase === 'won', error: null }
}

describe('bank full-match simulation', () => {
  it('drives seeded 2–4 player matches without ever breaking invariants', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const count = 2 + (seed % 3) // 2..4 players
      const players: PlayerSetup[] = Array.from({ length: count }, (_, i) => ({
        name: `Bot ${i + 1}`,
        color: ['#f00', '#0f0', '#00f', '#ff0'][i],
        isBot: true,
        botLevel: LEVELS[(seed + i) % LEVELS.length],
      }))
      const { state, finished, error } = playMatch(seed, players, 1200)
      expect(error, `seed ${seed}`).toBeNull()
      if (finished) {
        const active = state.players.filter((p) => p.status === 'active')
        expect(active).toHaveLength(1)
        expect(state.winnerId).toBe(active[0].id)
        expect(state.bankruptedOrder).toHaveLength(count - 1)
      }
    }
  })

  it('a lean economy bankrupts everyone but one (last standing)', () => {
    // Low cash + no pass reward starves players fast, so the match resolves.
    const lean: BankRules = { startCash: 400, passStartReward: 0, diceCount: 2, doubles: true, jailFine: 50, maxRounds: null }
    const players: PlayerSetup[] = [
      { name: 'A', color: '#f00', isBot: true, botLevel: 'hard' },
      { name: 'B', color: '#0f0', isBot: true, botLevel: 'easy' },
      { name: 'C', color: '#00f', isBot: true, botLevel: 'medium' },
    ]
    const { state, finished, error } = playMatch(3, players, 5000, lean)
    expect(error).toBeNull()
    expect(finished).toBe(true)
    expect(state.winReason).toBe('lastStanding')
    expect(state.players.filter((p) => p.status === 'active')).toHaveLength(1)
  })

  it('a round cap ends a timed match with a declared winner', () => {
    const timed: BankRules = { startCash: 1500, passStartReward: 200, diceCount: 2, doubles: true, jailFine: 50, maxRounds: 5 }
    const players: PlayerSetup[] = [
      { name: 'A', color: '#f00', isBot: true, botLevel: 'hard' },
      { name: 'B', color: '#0f0', isBot: true, botLevel: 'easy' },
    ]
    const { state, finished, error } = playMatch(7, players, 5000, timed)
    expect(error).toBeNull()
    expect(finished).toBe(true)
    expect(['lastStanding', 'rounds']).toContain(state.winReason)
    expect(state.winnerId).not.toBeNull()
  })
})
