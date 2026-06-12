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
 * The rule variant for one match — chosen at setup (host chooses online) and
 * broadcast inside `start`, so every client plays the same game.
 */
export interface LudoRules {
  /** Dice per roll. With two dice you move one token by the SUM; releasing
   *  needs a 6 on either die; *doubles* (not sixes) chain the extra turn. */
  diceCount: 1 | 2
  /** Each player begins with one token already on their entry square. */
  startWithOneOut: boolean
  /** Two same-seat tokens on a ring cell block opponents (classic rule). */
  blockades: boolean
  /** A player may not enter their home column until they have captured once. */
  captureToEnterHome: boolean
  /** 2v2 team play (exactly 4 players): seats 0&2 vs seats 1&3. Teammates are
   *  never captured or blocked; the match ends when one team is fully home. */
  teams: boolean
}

/** How a computer player thinks (local play only). */
export type BotLevel = 'easy' | 'smart'

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
  /** Has captured at least once this match (the capture-to-enter-home gate). */
  hasCaptured: boolean
  /** Computer-controlled (local play only). Carried data, never a rule. */
  isBot: boolean
  /** How the bot thinks (when `isBot`). */
  botLevel?: BotLevel
}

export interface LudoGameState {
  players: LudoPlayer[]
  currentPlayerIndex: number
  phase: LudoPhase
  /** The match's rule variant (fixed at START_GAME). */
  rules: LudoRules
  /** Total of the last roll (sum when playing with two dice). */
  lastRoll: number | null
  /** The last roll's individual dice (empty before the first roll / after a resync). */
  lastDice: DieValue[]
  /** First-place finisher (`finishedOrder[0]`), or the forfeit survivor. */
  winnerId: number | null
  winReason: LudoWinReason | null
  /** Seat ids in the order they brought all four tokens home (1st, 2nd, 3rd…). */
  finishedOrder: number[]
  /** Committed turns since the match started — the online sync sequence number. */
  turnCount: number
  /**
   * The current player's extra-turn chain this turn: consecutive 6s with one
   * die, consecutive doubles with two. Resets when the turn passes; three in a
   * row ends the turn with no move. Lives in state (not just the resolution)
   * so the acting client can compute the next chain count.
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
  /** The dice as rolled (one or two). */
  dice: DieValue[]
  /** Total moved — the sum of `dice`. */
  roll: number
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
  /** The seat earns another roll (a non-final 6/doubles, or a capture). */
  extraTurn: boolean
  /** Extra-turn chain count after this roll (carried so the reducer stays pure). */
  sixCount: number
  /** True when nothing moved (no legal move, or the third chained 6/doubles). */
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
  hasCaptured: boolean
}
