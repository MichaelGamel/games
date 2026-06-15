/**
 * Core domain types for Backgammon (طاولة). Pure data shapes — no React, no DOM.
 * Mirrors `game/types.ts` (Snakes) and `ludo/types.ts`.
 *
 * Board storage is **absolute and direction-neutral**: points are indexed 0..23
 * and a signed count says who sits there (+n = seat 0, -n = seat 1). Movement
 * direction is derived per-seat in `board.ts`, never stored, so the geometry is
 * RTL-safe (the UI maps an absolute index to a screen quadrant).
 *
 * Seat 0 ("White") travels from index 23 down toward 0 and bears off past 0
 * (home board = indices 0..5). Seat 1 ("Black") travels from 0 up toward 23 and
 * bears off past 23 (home board = indices 18..23).
 */
import type { DieValue, MatchDecision } from '../game/types'

export type { DieValue, MatchDecision }

/** How a computer player thinks (local play only). */
export type BotLevel = 'easy' | 'smart'

/**
 * The rule variant for one match — chosen at setup (host chooses online) and
 * broadcast inside `start`, so every client plays the same game. MVP is the
 * standard single game; the doubling cube and match-play-to-N points are kept
 * as fields for a future variant but default off.
 */
export interface BackgammonRules {
  /** Doubling cube (future). Default false. */
  doublingCube: boolean
  /** Points-to-N match play (future). Default 1 = single game. */
  matchLength: number
  /** A larger die may bear off a checker from a lower point when no checker sits
   *  higher than the die (the standard overflow rule). Default true. */
  autoBearOffOverflow: boolean
}

/**
 * Finite phases of a game.
 * - `setup`     — choosing players, board hidden
 * - `idle`      — waiting for the current player to roll
 * - `rolling`   — the dice are tumbling
 * - `selecting` — local-only: dice rolled, building the move sequence by tapping
 * - `moving`    — a committed sequence is animating checker by checker
 * - `won`       — the match is over (someone bore off all 15, or a forfeit)
 */
export type BackgammonPhase = 'setup' | 'idle' | 'rolling' | 'selecting' | 'moving' | 'won'

/** How the game ended (drives the result overlay copy + recap). */
export type BackgammonWinReason = 'single' | 'gammon' | 'backgammon' | 'forfeit'

export interface BackgammonPlayer {
  /** Stable 0-based index, also the seat / turn order (0 = White, 1 = Black). */
  id: number
  name: string
  /** Checker color as a CSS hex string. */
  color: string
  /** Computer-controlled (local play only). Carried data, never a rule. */
  isBot: boolean
  /** How the bot thinks (when `isBot`). */
  botLevel?: BotLevel
}

/**
 * The board. `points[i]` is a signed checker count: +n = n of seat 0's checkers,
 * −n = n of seat 1's, 0 = empty. `bar`/`off` are `[seat0, seat1]`.
 */
export interface BackgammonBoard {
  points: number[]
  bar: [number, number]
  off: [number, number]
}

export interface BackgammonGameState {
  players: BackgammonPlayer[]
  currentPlayerIndex: number
  phase: BackgammonPhase
  rules: BackgammonRules
  board: BackgammonBoard
  /** The dice exactly as last rolled (two values; doubles are stored as the two
   *  equal faces, not expanded). Empty before the first roll / after a resync. */
  lastDice: DieValue[]
  /** Sum of the last roll — parity with the other games' `lastRoll` field. */
  lastRoll: number | null
  winnerId: number | null
  winReason: BackgammonWinReason | null
  /** `[winnerId]` once decided — kept for the shared online machinery. */
  finishedOrder: number[]
  /** Committed turns since the match started — the online sync sequence number. */
  turnCount: number
}

/**
 * One checker hop within a turn — the unit replayed in `executeTurn`. `from` is
 * a point 0..23 or {@link BAR}; `to` is a point 0..23 or {@link OFF}.
 */
export interface SubMove {
  from: number
  to: number
  die: DieValue
  /** Landing here sent a lone opponent checker to the bar. */
  hit: boolean
}

/**
 * The fully-computed outcome of one turn — the entire over-the-wire contract.
 * The dice are the only random part (rolled once via an injected RNG on the
 * acting client); `moves` is the ordered list the player built, replayed
 * identically on every other client.
 */
export interface BackgammonTurnResolution {
  /** Seat that played (its `currentPlayerIndex` at roll time). */
  seat: number
  /** The dice as rolled (two values; doubles not expanded). */
  dice: DieValue[]
  /** Ordered checker hops. Empty when nothing was playable. */
  moves: SubMove[]
  /** The dice rolled but no legal move existed → the turn passes. */
  noLegalMoves: boolean
  /** This turn bore off the acting seat's 15th checker. */
  isWin: boolean
  /** Win magnitude when `isWin` (single / gammon / backgammon). */
  winReason: BackgammonWinReason | null
}

/**
 * Per-seat board state carried in online snapshots/heartbeats — the `S` payload.
 * Backgammon's board is shared (not per-seat), so this is just a cheap parity
 * probe; the full board rides the snapshot's `shared` blob ({@link
 * BackgammonShared}), exactly like Chess.
 */
export interface BackgammonSeatState {
  /** This seat's checkers on the board + bar + borne off (always 15). */
  onBoard: number
  /** This seat's borne-off count — a quick, cheap divergence check. */
  off: number
}

/** Game-global snapshot blob (the net layer's opaque `shared`). */
export interface BackgammonShared {
  board: BackgammonBoard
  lastDice: DieValue[]
  winnerId: number | null
  winReason: BackgammonWinReason | null
}
