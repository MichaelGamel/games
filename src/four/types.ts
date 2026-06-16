/**
 * Core domain types for Connect Four. Pure data shapes — no React, no DOM.
 * Mirrors `game/types.ts` (Snakes) and `ludo/types.ts`.
 */
import type { MatchDecision } from '../game/types'

export type { MatchDecision }

/** A board cell as [row, col]; row 0 is the TOP row. */
export type Cell = [row: number, col: number]

/**
 * Computer-opponent strength (local play only).
 * - `easy`   — takes obvious wins, often misses blocks, otherwise random.
 * - `medium` — the classic heuristic: win, block, avoid gifting, play center-out.
 * - `hard`   — a deep alpha-beta search; plays at a near-professional level.
 */
export type FourBotLevel = 'easy' | 'medium' | 'hard'

/**
 * Finite phases of a game.
 * - `setup`    — choosing players, board hidden
 * - `idle`     — waiting for the current player to pick a column
 * - `dropping` — a disc is falling
 * - `won`      — the match is over (win, draw, or forfeit)
 */
export type FourPhase = 'setup' | 'idle' | 'dropping' | 'won'

export type FourWinReason = 'goal' | 'forfeit'

export interface FourPlayer {
  /** Stable 0-based index, also used as turn order. */
  id: number
  name: string
  /** Disc color as a CSS hex string. */
  color: string
  /** Computer-controlled player (local play only). Carried data, never a rule. */
  isBot: boolean
  /** Bot strength when `isBot` (local play only). Defaults to `medium`. */
  botLevel?: FourBotLevel
}

export interface FourState {
  players: FourPlayer[]
  currentPlayerIndex: number
  phase: FourPhase
  /**
   * The grid as `board[row][col]` = seat index, or `-1` for empty.
   * Row 0 is the top (discs land on the highest free row index).
   */
  board: number[][]
  /** Column of the last committed drop (display only). */
  lastColumn: number | null
  winnerId: number | null
  winReason: FourWinReason | null
  /** The four (or more) winning cells, for the highlight. */
  winLine: Cell[] | null
  /** Board filled with no winner. */
  draw: boolean
  /** `[winnerId]` once decided — kept for the shared online machinery. */
  finishedOrder: number[]
  /** Committed turns since the match started — the online sync sequence number. */
  turnCount: number
}

/**
 * The fully-computed outcome of one drop — the entire over-the-wire contract.
 * Computed once on the acting client and replayed identically everywhere.
 */
export interface FourResolution {
  seat: number
  column: number
  /** The row the disc lands on (row 0 = top). */
  row: number
  isWin: boolean
  winLine: Cell[] | null
  isDraw: boolean
}

/** Per-seat wire payload for online snapshots/heartbeats: that seat's discs. */
export interface FourSeatState {
  cells: Cell[]
}
