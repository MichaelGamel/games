/**
 * Single source of truth for every Tic-Tac-Toe tunable. Mirrors the role of
 * `four/config.ts` (Connect Four) and `game/config.ts` (Snakes).
 */

/** The board is SIZE×SIZE; WIN_LENGTH marks in a row (row/col/diagonal) wins. */
export const SIZE = 3
export const WIN_LENGTH = 3

/** Tic-Tac-Toe is strictly head-to-head. */
export const XO_MAX_PLAYERS = 2
export const XO_MIN_PLAYERS = 2

/** Seat → mark. Seat 0 is always ✕ (moves first), seat 1 is ◯. */
export const MARKS = ['X', 'O'] as const
export type Mark = (typeof MARKS)[number]

export interface ColorOption {
  name: string
  value: string
}

/** Selectable mark colors (classic rose ✕ / sky ◯ first). */
export const XO_COLORS: readonly ColorOption[] = [
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Sky', value: '#38bdf8' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Emerald', value: '#34d399' },
]

export interface PlayerPreset {
  name: string
  color: string
}

export const DEFAULT_XO_PLAYERS: readonly PlayerPreset[] = [
  { name: 'Player 1', color: XO_COLORS[0].value },
  { name: 'Player 2', color: XO_COLORS[1].value },
]

/** All animation timings (ms) in one place so motion stays in sync. */
export const TIMING = {
  /** A mark drawing itself into the square. */
  placeMs: 280,
  /** Pause on the landed mark before the turn commits. */
  settleMs: 140,
  /** Beat between each winning square lighting up in the victory walk. */
  winStepMs: 460,
  /** Hold on the fully-lit win line (with the fanfare) before the overlay. */
  winFanfareMs: 1000,
  /** How long the "turn skipped" notice stays on screen. */
  skipFlashMs: 3200,
  /** "Thinking" pause before a computer player auto-marks (local play). */
  botThinkMs: 600,
} as const
