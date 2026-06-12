/**
 * Core domain types for Ludo. Pure data shapes — no React, no DOM. Shared by
 * logic, hooks, and UI. Mirrors `src/game/types.ts` for Snakes.
 *
 * The die (1..6) and the host's continue/end call are identical to Snakes, so we
 * reuse those types rather than redefining them (DRY).
 */
import type { DieValue, MatchDecision } from '../game/types'

export type { DieValue, MatchDecision }

/**
 * Finite phases of a Ludo game.
 * - `setup`       — choosing players, board hidden
 * - `idle`        — waiting for the current player to roll
 * - `rolling`     — dice is tumbling
 * - `selecting`   — local-only: the roll has >1 legal move; waiting for a tap
 * - `moving`      — a token is hopping / capturing / arriving home
 * - `celebrating` — a player just brought all 4 tokens home but others race on;
 *                   paused until the host decides continue/end
 * - `won`         — the match is over (standings are final)
 */
export type LudoPhase =
  | 'setup'
  | 'idle'
  | 'rolling'
  | 'selecting'
  | 'moving'
  | 'celebrating'
  | 'won'

/** How the match ended: all four home, or everyone else leaving. */
export type LudoWinReason = 'goal' | 'forfeit'

export interface LudoPlayer {
  /** Stable 0-based index, also the seat / turn order. */
  id: number
  name: string
  /** Token color as a CSS hex string. */
  color: string
  /**
   * Progress of each of the 4 tokens (see the progress model in `config.ts`):
   * `-1` base · `0..50` shared ring (own view) · `51..55` home column · `56` home.
   */
  tokens: number[]
  /** Computer-controlled (local play only). Carried data, never a rule. */
  isBot: boolean
}

export interface LudoGameState {
  players: LudoPlayer[]
  currentPlayerIndex: number
  phase: LudoPhase
  lastRoll: DieValue | null
  /** First-place finisher (`finishedOrder[0]`), or the forfeit survivor. */
  winnerId: number | null
  winReason: LudoWinReason | null
  /** Seat ids in the order they brought all four tokens home (1st, 2nd, 3rd…). */
  finishedOrder: number[]
  /** Committed turns since the match started — the online sync sequence number. */
  turnCount: number
  /**
   * Consecutive 6s the current player has rolled this turn. Resets to 0 when the
   * turn passes. Three in a row ends the turn with no move. Lives in state (not
   * just the resolution) so the acting client can compute the next `sixCount`.
   */
  consecutiveSixes: number
}

/** One opponent token sent back to its base by a capturing move. */
export interface Capture {
  seat: number
  tokenId: number
}

/**
 * A single legal move for one token given the current roll, returned by
 * {@link legalMoves}. The UI highlights one per selectable token.
 */
export interface TokenMoveOption {
  tokenId: number
  from: number
  to: number
  /** True when this move pops the token out of its base (only on a 6). */
  releasedFromBase: boolean
  /** Progress values stepped through after `from`, ending on `to` (for animation). */
  stepPath: number[]
  /** Opponent tokens captured by landing (empty on safe cells / no opponent). */
  captures: Capture[]
  /** True when this move lands the token in its home goal (progress 56). */
  reachedHome: boolean
}

/**
 * The fully-computed outcome of one roll — the entire over-the-wire contract.
 * Computed once on the acting client (after any local selection) and replayed
 * identically on every other client, so the explicit `tokenId` is the crux:
 * remote clients never re-decide which token moved.
 */
export interface LudoTurnResolution {
  /** Seat that played (its `currentPlayerIndex` at roll time). */
  seat: number
  roll: DieValue
  /** Token moved (0..3), or `-1` for a no-move turn (no legal move / third six). */
  tokenId: number
  from: number
  to: number
  releasedFromBase: boolean
  stepPath: number[]
  captures: Capture[]
  reachedHome: boolean
  /** This move brought the acting seat's 4th token home (the seat is finished). */
  isWin: boolean
  /** The seat earns another roll (a non-final 6, or a capture). */
  extraTurn: boolean
  /** Consecutive-six count after this roll (carried so the reducer stays pure). */
  sixCount: number
  /** True when nothing moved (no legal move, or the third consecutive six). */
  noMove: boolean
}

/**
 * Per-seat board state carried in online snapshots/heartbeats — the `S` payload
 * the generic net layer is parameterised over. Each seat publishes its 4 token
 * progresses; only the current seat's `consecutiveSixes` is meaningful.
 */
export interface LudoSeatState {
  tokens: number[]
  consecutiveSixes: number
}
