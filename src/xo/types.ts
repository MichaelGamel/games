/**
 * Core domain types for Tic-Tac-Toe. Pure data shapes — no React, no DOM.
 * Mirrors `four/types.ts` (Connect Four) and `game/types.ts`.
 */
import type { MatchDecision } from '../game/types'
import type { Mark } from './config'

export type { MatchDecision }

/** A board cell as [row, col]; row 0 is the TOP row, col 0 the LEFT column. */
export type Cell = [row: number, col: number]

/**
 * Finite phases of a game.
 * - `setup`   — choosing players, board hidden
 * - `idle`    — waiting for the current player to pick a square
 * - `placing` — a mark is being drawn into a square
 * - `won`     — the match is over (win, draw, or forfeit)
 */
export type XOPhase = 'setup' | 'idle' | 'placing' | 'won'

export type XOWinReason = 'goal' | 'forfeit'

export interface XOPlayer {
  /** Stable 0-based index, also used as turn order. */
  id: number
  name: string
  /** Mark color as a CSS hex string. */
  color: string
  /** This seat's mark — ✕ for seat 0, ◯ for seat 1. */
  mark: Mark
  /** Computer-controlled player (local play only). Carried data, never a rule. */
  isBot: boolean
}

export interface XOState {
  players: XOPlayer[]
  currentPlayerIndex: number
  phase: XOPhase
  /** The grid as `board[row][col]` = seat index, or `-1` for empty. */
  board: number[][]
  /** The last committed square (display only). */
  lastCell: Cell | null
  winnerId: number | null
  winReason: XOWinReason | null
  /** The three (or more) winning cells, for the highlight. */
  winLine: Cell[] | null
  /** Board filled with no winner. */
  draw: boolean
  /** `[winnerId]` once decided — kept for the shared online machinery. */
  finishedOrder: number[]
  /** Committed turns since the match started — the online sync sequence number. */
  turnCount: number
}

/**
 * The fully-computed outcome of one mark — the entire over-the-wire contract.
 * Computed once on the acting client and replayed identically everywhere.
 */
export interface XOResolution {
  seat: number
  row: number
  col: number
  isWin: boolean
  winLine: Cell[] | null
  isDraw: boolean
}

/** Per-seat wire payload for online snapshots/heartbeats: that seat's marks. */
export interface XOSeatState {
  cells: Cell[]
}
