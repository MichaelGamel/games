/**
 * Single source of truth for every game tunable: the classic board layout, the
 * token palette, default rules, and animation timings. Changing the game means
 * editing this file — nothing else hard-codes these values (DRY).
 *
 * Per-match values (board size, dice count, generated layouts) live in
 * `SnakesRules`/`BoardLayout` on the game state; the constants here are the
 * classic defaults those are built from.
 */
import type { SnakesRules } from './types'

export const DIE_FACES = 6

/** Hard ceiling on players per game session (local or online). */
export const MAX_PLAYERS = 4
/** Minimum players a match needs to start. */
export const MIN_PLAYERS = 2

/** Classic board: ladder foot → ladder top (always climbing up). */
export const CLASSIC_LADDERS: Readonly<Record<number, number>> = {
  1: 38,
  4: 14,
  9: 31,
  21: 42,
  28: 84,
  36: 44,
  51: 67,
  71: 91,
  80: 100,
}

/** Classic board: snake head → snake tail (always sliding down). */
export const CLASSIC_SNAKES: Readonly<Record<number, number>> = {
  16: 6,
  47: 26,
  49: 11,
  56: 53,
  62: 19,
  64: 60,
  87: 24,
  93: 73,
  95: 75,
  98: 78,
}

/** The canonical game: classic 10×10 board, one die, no special cells. */
export const DEFAULT_SNAKES_RULES: Readonly<SnakesRules> = {
  board: 'classic',
  seed: 1,
  size: 10,
  diceCount: 1,
  specials: false,
}

export interface ColorOption {
  name: string
  value: string
}

/** Selectable token colors on the setup screen. */
export const TOKEN_COLORS: readonly ColorOption[] = [
  { name: 'Crimson', value: '#ef4444' },
  { name: 'Ocean', value: '#3b82f6' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Sunburst', value: '#f59e0b' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Rose', value: '#ec4899' },
]

export interface PlayerPreset {
  name: string
  color: string
}

export const DEFAULT_PLAYERS: readonly PlayerPreset[] = [
  { name: 'Player 1', color: TOKEN_COLORS[0].value },
  { name: 'Player 2', color: TOKEN_COLORS[1].value },
]

/** All animation timings (ms) in one place so motion stays in sync. */
export const TIMING = {
  /** Duration of the dice tumble before it settles on a face. */
  diceRollMs: 950,
  /** Time the token spends walking one cell. */
  stepMs: 240,
  /** Time the token spends climbing a ladder or sliding a snake. */
  jumpMs: 850,
  /** Beat on a special cell (shield pickup / swap / teleport) before commit. */
  specialMs: 700,
  /** Pause before handing the turn to the next player. */
  turnHandoffMs: 420,
  /** How long the "rolled a 6 — go again!" celebration stays on screen. */
  extraTurnFlashMs: 2600,
  /** How long a special-cell banner (shield/swap/teleport) stays on screen. */
  specialFlashMs: 2600,
  /** How long the "turn skipped" notice stays on screen. */
  skipFlashMs: 3200,
  /** "Thinking" pause before a computer player auto-rolls (local play). */
  botThinkMs: 650,
} as const
