/**
 * Single source of truth for every Backgammon tunable: board constants, the
 * standard starting position, the checker palette, default rules, and animation
 * timings. Mirrors the role of `four/config.ts` and `ludo/config.ts`.
 */
import type { BackgammonRules } from './types'

export const POINT_COUNT = 24
export const CHECKERS_PER_PLAYER = 15
/** Sentinel for {@link SubMove.from} — a checker entering from the bar. */
export const BAR = -1
/** Sentinel for {@link SubMove.to} — a checker borne off the board. */
export const OFF = 24

/** Backgammon is strictly head-to-head. */
export const BACKGAMMON_MAX_PLAYERS = 2
export const BACKGAMMON_MIN_PLAYERS = 2

/**
 * The standard starting position as signed point counts (absolute indices).
 * Seat 0 (+): 2 on 23, 5 on 12, 3 on 7, 5 on 5. Seat 1 (−) mirrors it across
 * `index ↔ 23 − index`. Each seat totals 15; each starts with 167 pips.
 */
export const STARTING_POINTS: readonly number[] = (() => {
  const p = new Array<number>(POINT_COUNT).fill(0)
  p[23] = 2
  p[12] = 5
  p[7] = 3
  p[5] = 5
  p[0] = -2
  p[11] = -5
  p[16] = -3
  p[18] = -5
  return p
})()

/** Each seat's home-board point indices (where it bears off from). */
export const HOME_RANGE: Readonly<Record<number, readonly number[]>> = {
  0: [0, 1, 2, 3, 4, 5],
  1: [18, 19, 20, 21, 22, 23],
}

export interface ColorOption {
  name: string
  value: string
}

/** Selectable checker colors — classic ivory vs onyx first, then alternates. */
export const BACKGAMMON_COLORS: readonly ColorOption[] = [
  { name: 'Ivory', value: '#ece3cf' },
  { name: 'Onyx', value: '#2c2535' },
  { name: 'Ruby', value: '#ef4444' },
  { name: 'Ocean', value: '#0ea5e9' },
]

export interface PlayerPreset {
  name: string
  color: string
}

export const DEFAULT_BACKGAMMON_PLAYERS: readonly PlayerPreset[] = [
  { name: 'Player 1', color: BACKGAMMON_COLORS[0].value },
  { name: 'Player 2', color: BACKGAMMON_COLORS[1].value },
]

export const DEFAULT_BACKGAMMON_RULES: Readonly<BackgammonRules> = {
  doublingCube: false,
  matchLength: 1,
  autoBearOffOverflow: true,
}

/**
 * Validate a rules payload that arrived over the wire (or default it). A
 * malformed payload must never crash the reducer — fall back to the standard
 * game. Mirrors `asLudoRules`.
 */
export function asBackgammonRules(value: unknown): BackgammonRules {
  if (typeof value !== 'object' || value == null) return { ...DEFAULT_BACKGAMMON_RULES }
  const v = value as Partial<BackgammonRules>
  return {
    doublingCube: v.doublingCube === true,
    matchLength: typeof v.matchLength === 'number' && v.matchLength >= 1 ? Math.floor(v.matchLength) : 1,
    autoBearOffOverflow: v.autoBearOffOverflow !== false,
  }
}

/** All animation timings (ms) in one place so motion stays in sync. */
export const TIMING = {
  /** Duration of the dice tumble before they settle. */
  diceRollMs: 900,
  /** Time a checker spends sliding to its destination point. */
  checkerStepMs: 280,
  /** An opponent checker flying to the bar after a hit. */
  hitMs: 460,
  /** A checker leaving the board into its bear-off tray. */
  bearOffMs: 420,
  /** Pause before handing the turn to the next player. */
  turnHandoffMs: 420,
  /** Short handoff used when a roll produced no legal move. */
  noMoveHandoffMs: 750,
  /** How long the "turn skipped" notice stays on screen. */
  skipFlashMs: 3200,
  /** "Thinking" pause before a computer player auto-rolls / auto-moves. */
  botThinkMs: 700,
} as const
