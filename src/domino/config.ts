/**
 * Single source of truth for every Dominoes tunable: set/hand sizes, seat
 * colors, default players, the board-layout geometry, and animation timings.
 * Changing the game means editing this file — nothing else hard-codes these
 * values (DRY). Mirrors `src/uno/config.ts` and `src/four/config.ts`.
 */
import type { DominoStartConfig } from './deck'

/** Up to four players, like the board games (UNO's six is the outlier). */
export const DOMINO_MAX_PLAYERS = 4
/** Two players to start a match — the same floor as every other game. */
export const DOMINO_MIN_PLAYERS = 2

/** Tiles dealt to each player at the start of a round. */
export function handSizeFor(playerCount: number): number {
  // Standard Draw Dominoes: 7 each head-to-head, 5 each for 3–4 players.
  return playerCount === 2 ? 7 : 5
}

export interface ColorOption {
  name: string
  value: string
}

/** Selectable seat colors — one per seat, up to four players. */
export const DOMINO_SEAT_COLORS: readonly ColorOption[] = [
  { name: 'Ivory', value: '#e2e8f0' },
  { name: 'Ruby', value: '#ef4444' },
  { name: 'Leaf', value: '#22c55e' },
  { name: 'Sky', value: '#3b82f6' },
]

export interface PlayerPreset {
  name: string
  color: string
}

export const DEFAULT_DOMINO_PLAYERS: readonly PlayerPreset[] = [
  { name: 'Player 1', color: DOMINO_SEAT_COLORS[0].value },
  { name: 'Player 2', color: DOMINO_SEAT_COLORS[1].value },
]

/**
 * Validate the `start` payload that arrived over the wire (or default it).
 * Draw Dominoes has no rule variants; the only thing that travels in `start` is
 * the shared `deckSeed`. Online clients run the same build, but a malformed or
 * missing payload must never crash the reducer.
 */
export function asDominoStart(value: unknown): DominoStartConfig {
  if (typeof value === 'object' && value != null) {
    const v = value as Partial<DominoStartConfig>
    if (typeof v.deckSeed === 'number' && Number.isFinite(v.deckSeed)) {
      return { deckSeed: Math.floor(v.deckSeed) }
    }
  }
  return { deckSeed: 0 }
}

/**
 * Board-layout geometry, in abstract tile-units. A tile is `tileLong × tileShort`
 * laid lengthwise along a serpentine row; rows alternate direction and the board
 * auto-scales so the whole line is always visible. See `layout.ts`.
 */
export const LAYOUT = {
  tileLong: 2,
  tileShort: 1,
  /** Gap between consecutive tiles along a row (units). */
  gap: 0.12,
  /** Vertical gap between serpentine rows (units). */
  rowGap: 0.55,
  /** Tiles per row before the line wraps to the next row. */
  perRow: 7,
} as const

/** All animation timings (ms) in one place so motion stays in sync. */
export const TIMING = {
  /** A tile settling onto the line. */
  placeMs: 420,
  /** A bone sliding from the boneyard into a hand. */
  drawMs: 300,
  /** Stagger between bones when dealing a fresh round. */
  dealStaggerMs: 60,
  /** The "knock" pulse when a player is forced to pass. */
  passMs: 600,
  /** The board re-scaling as the line grows. */
  scaleMs: 380,
  /** Pause before handing the turn to the next player. */
  turnHandoffMs: 380,
  /** How long the "turn skipped" / "passed" notice stays on screen. */
  skipFlashMs: 3000,
  /** "Thinking" pause before a computer player auto-plays. */
  botThinkMs: 650,
} as const
