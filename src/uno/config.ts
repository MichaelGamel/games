/**
 * Single source of truth for every UNO tunable: deck/hand sizes, the suit
 * palette, seat colors, default rules, scoring values, and animation timings.
 * Changing the game means editing this file — nothing else hard-codes these
 * values (DRY). Mirrors the role of `src/game/config.ts` (Snakes) and
 * `src/ludo/config.ts` (Ludo), but kept separate so games never share tunables.
 */
import type { UnoColor, UnoRules, UnoWinMode } from './types'

/**
 * UNO seats up to six players online — more than the board games' four. This is
 * threaded to `useOnlineMatch` / `computeRoster` as the `maxPlayers` parameter
 * (UNO only), so the shared `MAX_PLAYERS` constant (still 4) is never bumped and
 * Snakes/Ludo/Four are unaffected.
 */
export const UNO_MAX_PLAYERS = 6

/** Two players to start a match — the same floor as every other game. */
export const UNO_MIN_PLAYERS = 2

/** Cards dealt to each player at the start of a round. */
export const HAND_SIZE = 7

/** The four playable suits, in canonical UNO order (also the wedge order of the
 *  wild color picker). Wild cards belong to none of them. */
export const UNO_COLORS: readonly UnoColor[] = ['red', 'yellow', 'green', 'blue']

/** Each suit's display hex, for card faces and the active-color chip. */
export const CARD_COLOR_HEX: Readonly<Record<UnoColor, string>> = {
  red: '#ef4444',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
}

/** Points a card is worth to the round winner (number cards score their face). */
export const SCORING = {
  /** Skip / Reverse / Draw-Two. */
  action: 20,
  /** Wild / Wild-Draw-Four. */
  wild: 50,
} as const

/** Selectable score targets for `score` win mode. */
export const SCORE_TARGETS: readonly number[] = [200, 300, 500]
/** Default points target when `score` mode is chosen. */
export const DEFAULT_TARGET_SCORE = 500

/** The cleanest classic game: every house rule off, a single round. */
export const DEFAULT_UNO_RULES: Readonly<UnoRules> = {
  stacking: false,
  challengeWild4: false,
  sevenZero: false,
  jumpIn: false,
  winMode: 'single',
  targetScore: DEFAULT_TARGET_SCORE,
}

/**
 * Validate a rules payload that arrived over the wire (or default it). Online
 * clients run the same build, but a malformed/missing payload must never crash
 * the reducer — fall back to the classic game.
 */
export function asUnoRules(value: unknown): UnoRules {
  if (typeof value !== 'object' || value == null) return { ...DEFAULT_UNO_RULES }
  const v = value as Partial<UnoRules>
  const winMode: UnoWinMode = v.winMode === 'score' ? 'score' : 'single'
  const target =
    typeof v.targetScore === 'number' && Number.isFinite(v.targetScore) && v.targetScore > 0
      ? Math.floor(v.targetScore)
      : DEFAULT_TARGET_SCORE
  return {
    stacking: v.stacking === true,
    challengeWild4: v.challengeWild4 === true,
    sevenZero: v.sevenZero === true,
    jumpIn: v.jumpIn === true,
    winMode,
    targetScore: target,
  }
}

export interface ColorOption {
  name: string
  value: string
}

/** Selectable seat colors — one per seat, up to six players. These identify
 *  *players*, not cards (the deck has its own fixed four suits). */
export const UNO_SEAT_COLORS: readonly ColorOption[] = [
  { name: 'Ruby', value: '#ef4444' },
  { name: 'Sky', value: '#3b82f6' },
  { name: 'Leaf', value: '#22c55e' },
  { name: 'Sunbeam', value: '#eab308' },
  { name: 'Grape', value: '#a855f7' },
  { name: 'Tangerine', value: '#f97316' },
]

export interface PlayerPreset {
  name: string
  color: string
}

export const DEFAULT_UNO_PLAYERS: readonly PlayerPreset[] = [
  { name: 'Player 1', color: UNO_SEAT_COLORS[0].value },
  { name: 'Player 2', color: UNO_SEAT_COLORS[1].value },
]

/** All animation timings (ms) in one place so motion stays in sync. */
export const TIMING = {
  /** A card arcing from hand to the discard pile. */
  playCardMs: 360,
  /** A card sliding from the draw pile into a hand. */
  drawCardMs: 300,
  /** Stagger between cards when dealing a fresh round. */
  dealStaggerMs: 70,
  /** The Reverse direction-indicator spin. */
  reverseMs: 520,
  /** The skipped-seat pulse. */
  skipMs: 600,
  /** The active-color chip morph after a wild color pick. */
  colorPickMs: 420,
  /** A quick collapse/fan when the stock is rebuilt from the discard. */
  reshuffleMs: 700,
  /** Pause before handing the turn to the next player. */
  turnHandoffMs: 420,
  /** How long the "UNO!" / penalty flash stays on screen. */
  unoFlashMs: 2600,
  /** How long the "turn skipped" notice stays on screen. */
  skipFlashMs: 3200,
  /** "Thinking" pause before a computer player auto-plays. */
  botThinkMs: 700,
} as const
