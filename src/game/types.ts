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
 * - `setup`   — choosing players, board hidden
 * - `idle`    — waiting for the current player to roll
 * - `rolling` — dice is tumbling
 * - `moving`  — a token is walking / climbing / sliding
 * - `won`     — someone reached the final cell
 */
export type Phase = 'setup' | 'idle' | 'rolling' | 'moving' | 'won'

export interface GameState {
  players: Player[]
  currentPlayerIndex: number
  phase: Phase
  lastRoll: DieValue | null
  winnerId: number | null
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
