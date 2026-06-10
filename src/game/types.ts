/**
 * Core domain types for the Snakes & Ladders game.
 * Pure data shapes — no React, no DOM. Shared by logic, hooks, and UI.
 */

export type DieValue = 1 | 2 | 3 | 4 | 5 | 6

export type JumpKind = 'ladder' | 'snake'

/** A board connector: a ladder (to > from) or a snake (to < from). */
export interface Jump {
  from: number
  to: number
  kind: JumpKind
}

export interface Player {
  /** Stable 0-based index, also used as turn order. */
  id: number
  name: string
  /** Token color as a CSS hex string. */
  color: string
  /** Current cell: 0 = off-board start, 1..100 on the board. */
  position: number
}

/**
 * Finite phases of a game.
 * - `setup`       — choosing players, board hidden
 * - `idle`        — waiting for the current player to roll
 * - `rolling`     — dice is tumbling
 * - `moving`      — a token is walking / climbing / sliding
 * - `celebrating` — a player just reached the final cell but others can still
 *                   play on; paused until the host decides continue/end
 * - `won`         — the match is over (standings are final)
 */
export type Phase = 'setup' | 'idle' | 'rolling' | 'moving' | 'celebrating' | 'won'

/** How the match ended: reaching the final cell, or everyone else leaving. */
export type WinReason = 'goal' | 'forfeit'

/** Host's call after a mid-game finish: play on, or end with current standings. */
export type MatchDecision = 'continue' | 'end'

export interface GameState {
  players: Player[]
  currentPlayerIndex: number
  phase: Phase
  lastRoll: DieValue | null
  /** First-place finisher (`finishedOrder[0]`), or the forfeit survivor. */
  winnerId: number | null
  winReason: WinReason | null
  /**
   * Player ids in the order they reached the final cell (1st, 2nd, 3rd…).
   * Finished players drop out of the turn rotation but keep their seats.
   * The match ends when at most one active player remains — that last
   * player is never ranked.
   */
  finishedOrder: number[]
  /**
   * Number of committed turns since the match started. Acts as the sequence
   * number for online play: every client commits the same turns (including
   * skips and continue/end decisions) in the same order, so equal
   * `turnCount` ⇒ identical state.
   */
  turnCount: number
}

/**
 * The transient, mid-animation override for the one token currently in motion.
 * While present, the UI shows this token at `cell` (instead of its committed
 * position) and uses `kind` to choose the right motion (hop / climb / slide).
 */
export interface ActiveMove {
  playerId: number
  cell: number
  kind: 'walk' | 'ladder' | 'snake'
}

/**
 * The fully-computed outcome of a single roll. Pure data describing *what
 * happened* so the UI can animate it step by step without re-deriving rules.
 */
export interface TurnResolution {
  roll: DieValue
  from: number
  /** Cells to step through after `from`, in order, ending on `landed`. */
  walkPath: number[]
  /** True when the roll overshot the final cell and reflected back. */
  bounced: boolean
  /** Cell reached by walking, before any snake/ladder is applied. */
  landed: number
  /** The snake/ladder taken from `landed`, if any. */
  jump: Jump | null
  /** Final resting cell for this turn (after `jump`, or `landed`). */
  finalPos: number
  isWin: boolean
  /** True when the player earns another roll (rolled a 6 and did not win). */
  extraTurn: boolean
}
