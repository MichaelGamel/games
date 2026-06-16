/**
 * Single source of truth for every Connect Four tunable. Mirrors the role of
 * `game/config.ts` (Snakes) and `ludo/config.ts`.
 */
import type { FourBotLevel } from './types'

export const COLS = 7
export const ROWS = 6
/** Discs in a row needed to win. */
export const WIN_LENGTH = 4

/** Selectable computer-opponent levels, in display order (local play only). */
export const FOUR_BOT_LEVELS: readonly FourBotLevel[] = ['easy', 'medium', 'hard']

/** Pre-selected level when a seat is switched to the computer. */
export const DEFAULT_BOT_LEVEL: FourBotLevel = 'medium'

/**
 * Search depth (plies looked ahead) for the `hard` bot's alpha-beta engine.
 * Connect Four's branching factor is ≤ 7, so with center-first move ordering
 * this depth resolves in a few milliseconds yet plays a near-perfect game.
 */
export const HARD_SEARCH_DEPTH = 9

/** Connect Four is strictly head-to-head. */
export const FOUR_MAX_PLAYERS = 2
export const FOUR_MIN_PLAYERS = 2

export interface ColorOption {
  name: string
  value: string
}

/** Selectable disc colors (classic red/yellow first). */
export const FOUR_COLORS: readonly ColorOption[] = [
  { name: 'Red', value: '#ef4444' },
  { name: 'Sunbeam', value: '#eab308' },
  { name: 'Sky', value: '#3b82f6' },
  { name: 'Leaf', value: '#22c55e' },
]

export interface PlayerPreset {
  name: string
  color: string
}

export const DEFAULT_FOUR_PLAYERS: readonly PlayerPreset[] = [
  { name: 'Player 1', color: FOUR_COLORS[0].value },
  { name: 'Player 2', color: FOUR_COLORS[1].value },
]

/** All animation timings (ms) in one place so motion stays in sync. */
export const TIMING = {
  /** A disc falling down its column. */
  dropMs: 480,
  /** Pause on the landed disc before the turn commits. */
  settleMs: 220,
  /** Beat between each winning disc lighting up in the victory walk. */
  winStepMs: 620,
  /** Hold on the fully-lit win line (with the fanfare) before the overlay. */
  winFanfareMs: 1100,
  /** How long the "turn skipped" notice stays on screen. */
  skipFlashMs: 3200,
  /** "Thinking" pause before a computer player auto-drops (local play). */
  botThinkMs: 700,
} as const
