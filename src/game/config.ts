/**
 * Single source of truth for every game tunable: board geometry, the snake &
 * ladder layout, the token palette, and animation timings. Changing the game
 * means editing this file — nothing else hard-codes these values (DRY).
 */
import type { Jump } from './types'

export const BOARD_SIZE = 10
export const TOTAL_CELLS = BOARD_SIZE * BOARD_SIZE // 100
export const WINNING_CELL = TOTAL_CELLS
export const DIE_FACES = 6

/** Hard ceiling on players per game session (local or online). */
export const MAX_PLAYERS = 4
/** Minimum players a match needs to start. */
export const MIN_PLAYERS = 2

/** Classic board: ladder foot → ladder top (always climbing up). */
export const LADDERS: Readonly<Record<number, number>> = {
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
export const SNAKES: Readonly<Record<number, number>> = {
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

/** Pre-built lookup of every connector keyed by its entry cell. */
export const JUMPS: Readonly<Record<number, Jump>> = buildJumps()

function buildJumps(): Record<number, Jump> {
  const jumps: Record<number, Jump> = {}
  for (const [from, to] of Object.entries(LADDERS)) {
    jumps[Number(from)] = { from: Number(from), to, kind: 'ladder' }
  }
  for (const [from, to] of Object.entries(SNAKES)) {
    jumps[Number(from)] = { from: Number(from), to, kind: 'snake' }
  }
  return jumps
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
  /** Pause before handing the turn to the next player. */
  turnHandoffMs: 420,
  /** How long the "rolled a 6 — go again!" celebration stays on screen. */
  extraTurnFlashMs: 2600,
  /** How long the "turn skipped" notice stays on screen. */
  skipFlashMs: 3200,
  /** "Thinking" pause before a computer player auto-rolls (local play). */
  botThinkMs: 650,
} as const
