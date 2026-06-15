/**
 * Single source of truth for every chess tunable: the 3D palette, board/piece
 * dimensions, animation durations, and the AI search depths. Change how the
 * game looks and feels here — never with magic numbers in the scene.
 *
 * Colours are plain hex numbers (Three.js `Color` inputs). The palette is built
 * to sit inside the night/grape "Robin's Games" chrome: obsidian-and-pearl
 * pieces on a deep amethyst board, lit by violet and cyan rims.
 */

export const PALETTE = {
  /** Board squares. */
  light: 0xe9e3f4,
  dark: 0x3a2a66,
  /** Glowing seam between squares + the bevelled frame. */
  seam: 0x140c2e,
  frame: 0x271746,
  frameTrim: 0x7c3aed,
  /** Pieces. */
  whitePiece: 0xeee7d7,
  whiteEmissive: 0x3b3320,
  blackPiece: 0x201a30,
  blackEmissive: 0x5a37b8,
  /** Interaction glow. */
  select: 0x9d6bff,
  move: 0x7c5cff,
  capture: 0xff5470,
  check: 0xff3b5b,
  /** Atmosphere. */
  fog: 0x150d2b,
  floor: 0x120a26,
  star: 0xc9bcff,
  keyLight: 0xfff4e0,
  rimViolet: 0x8b5cf6,
  rimCyan: 0x38d6ff,
  victory: 0xffd56b,
} as const

/** Board + piece geometry, all in world units where one square is 1.0. */
export const DIMS = {
  square: 1,
  /** Tile face is slightly inset, leaving a glowing seam grid between squares. */
  tile: 0.94,
  tileHeight: 0.18,
  frameWidth: 0.7,
  /** Uniform scale applied to every procedurally-built piece. */
  pieceScale: 1.18,
  /** How high a selected/hovered piece floats. */
  lift: 0.22,
} as const

/** Animation durations in seconds. The renderer reads only from here. */
export const TIMING = {
  move: 0.6,
  /** Knights arc higher and a touch slower — they leap. */
  knightHop: 0.72,
  arcHeight: 0.55,
  knightArcHeight: 1.15,
  capture: 0.85,
  promote: 0.9,
  flip: 1.0,
  /** Pause before the computer answers, so its move reads as deliberate. */
  aiThink: 0.55,
} as const

/** Half-move search depth per difficulty for the negamax bot. */
export const AI_DEPTH: Record<'easy' | 'medium' | 'hard', number> = {
  easy: 1,
  medium: 2,
  hard: 3,
}

/** Chess is strictly head-to-head: White (seat 0) vs Black (seat 1). */
export const CHESS_MAX_PLAYERS = 2
export const CHESS_MIN_PLAYERS = 2

export interface ColorOption {
  name: string
  value: string
}

/**
 * Piece colours a player may choose for their army. The first two — true ivory
 * White and onyx Black — are the classic default; the rest are fun alternatives.
 * Online: each player picks one in the lobby (it colours their side's pieces).
 * Local: chosen on the menu before starting.
 */
export const CHESS_PIECE_COLORS: readonly ColorOption[] = [
  { name: 'White', value: '#ece6d8' },
  { name: 'Black', value: '#1c1a24' },
  { name: 'Amethyst', value: '#7c3aed' },
  { name: 'Cyan', value: '#22b8e6' },
  { name: 'Amber', value: '#e0962e' },
  { name: 'Rose', value: '#e0405e' },
  { name: 'Emerald', value: '#22a06b' },
]

/** Classic default: White (seat 0, moves first) vs Black (seat 1). */
export const DEFAULT_PIECE_COLORS = {
  white: CHESS_PIECE_COLORS[0].value,
  black: CHESS_PIECE_COLORS[1].value,
} as const

/** Centipawn material values, also used for the captured-tray advantage count. */
export const PIECE_VALUE: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
}
