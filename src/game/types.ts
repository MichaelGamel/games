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

/**
 * A special-effect cell:
 * - `shield`  — pick up a shield; it blocks the next snake you'd slide down.
 * - `swap`    — swap positions with the player furthest ahead of you.
 * - `mystery` — teleport to a random cell (resolved by the acting client and
 *               carried in the {@link TurnResolution}, so replays agree).
 */
export type SpecialKind = 'shield' | 'swap' | 'mystery'

/**
 * Everything that defines a playable board. The classic layout lives in
 * `config.ts`; random layouts come from `boardGen.ts`, derived from a seed so
 * every client builds the identical board.
 */
export interface BoardLayout {
  /** Cells per side; the board is size×size and the finish is size². */
  size: number
  /** Ladder foot → ladder top (always climbing up). */
  ladders: Record<number, number>
  /** Snake head → snake tail (always sliding down). */
  snakes: Record<number, number>
  /** Special-effect cells. Never on a jump endpoint, cell 1, or the finish. */
  specials: Record<number, SpecialKind>
}

/**
 * The rule variant for one match — chosen at setup (host chooses online) and
 * broadcast inside `start`, so every client plays the same game.
 */
export interface SnakesRules {
  /** `classic` is the canonical 10×10 layout; `random` is generated from `seed`. */
  board: 'classic' | 'random'
  /** Seed for the random board and for special-cell placement. */
  seed: number
  /** Board side: 10 = the classic 100-cell race, 8 = a quick 64-cell race
   *  (8 implies a generated board — there is no canonical 8×8 layout). */
  size: 8 | 10
  /** Dice per roll. With two dice you move the sum, and *doubles* (not sixes)
   *  grant the extra turn. */
  diceCount: 1 | 2
  /** Sprinkle shield/swap/mystery cells onto the board. */
  specials: boolean
}

export interface Player {
  /** Stable 0-based index, also used as turn order. */
  id: number
  name: string
  /** Token color as a CSS hex string. */
  color: string
  /** Current cell: 0 = off-board start, 1..size² on the board. */
  position: number
  /** Holds a shield (blocks the next snake; specials rule only). */
  shield: boolean
  /**
   * True for a computer-controlled player (local "Pass & Play" only). Carried
   * data, never a rule — the reducer never branches on it; the orchestration
   * layer just auto-rolls on a bot's turn.
   */
  isBot: boolean
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
  /** The match's rule variant (fixed at START_GAME). */
  rules: SnakesRules
  /** The playable board, derived from `rules` (fixed at START_GAME). */
  board: BoardLayout
  /** Total of the last roll (sum when playing with two dice). */
  lastRoll: number | null
  /** The last roll's individual dice (empty before the first roll / after a resync). */
  lastDice: DieValue[]
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
 * position) and uses `kind` to choose the right motion (hop / climb / slide /
 * teleport sparkle).
 */
export interface ActiveMove {
  playerId: number
  cell: number
  kind: 'walk' | 'ladder' | 'snake' | 'teleport'
}

/**
 * The fully-computed outcome of a single roll. Pure data describing *what
 * happened* so the UI can animate it step by step without re-deriving rules —
 * and the entire over-the-wire contract for online play.
 */
export interface TurnResolution {
  /** The dice as rolled (one or two). */
  dice: DieValue[]
  /** Total moved — the sum of `dice`. */
  roll: number
  from: number
  /** Cells to step through after `from`, in order, ending on `landed`. */
  walkPath: number[]
  /** True when the roll overshot the final cell and reflected back. */
  bounced: boolean
  /** Cell reached by walking, before any snake/ladder is applied. */
  landed: number
  /** The snake/ladder taken from `landed`, if any. */
  jump: Jump | null
  /** A held shield blocked the snake at `landed` (token stays; shield spent). */
  shieldUsed: boolean
  /** The special cell entered at the end of the move, if any. */
  special: SpecialKind | null
  /** A shield was picked up this turn. */
  shieldGained: boolean
  /** Swap special: id of the leader this player traded places with. */
  swapWith: number | null
  /** Swap special: the cell the swapped player ends up on (our pre-swap cell). */
  swapPartnerPos: number | null
  /** Mystery special: the teleport destination. */
  teleportTo: number | null
  /** Final resting cell for this turn (after jump/special effects). */
  finalPos: number
  isWin: boolean
  /** True when the player earns another roll (a 6 — or doubles with two dice —
   *  that did not win). */
  extraTurn: boolean
}

/** Per-seat wire payload for online snapshots and heartbeats. */
export interface SnakesSeatState {
  position: number
  shield: boolean
}
