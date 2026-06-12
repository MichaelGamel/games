/**
 * Single source of truth for every Ludo tunable: board geometry, the token
 * palette, progress-model constants, and animation timings. Changing the game
 * means editing this file — nothing else hard-codes these values (DRY).
 *
 * Mirrors the role of `src/game/config.ts` for Snakes, but is a separate file so
 * the two games never share mutable tunables.
 */

/** A board cell as 0-based grid coordinates (row from top, col from left). */
export type RC = readonly [row: number, col: number]

export const LUDO_BOARD_SIZE = 15
/** Cells on the shared ring (the main track everyone travels). */
export const RING_LENGTH = 52
/** Tokens each player controls. */
export const TOKENS_PER_PLAYER = 4
export const DIE_FACES = 6

// ---- Progress model (one integer per token) -------------------------------
// -1            in the base nest (off the board)
//  0..50        own view of the shared ring (0 = this seat's entry square)
//  51..55       private home column (5 cells, opponents can't enter)
//  56           completed — in the home goal (immovable, uncapturable)
export const PROGRESS_BASE = -1
export const PROGRESS_ENTRY = 0
/** Last shared-ring cell in a token's own view (before the home column). */
export const LAST_RING_PROGRESS = 50
export const HOME_COLUMN_LENGTH = 5
/** Progress value of a fully-completed token (the home goal). */
export const PROGRESS_GOAL = 56

/** Each seat's entry square as an absolute ring index; seats sit 13 cells apart.
 *  `absCell = (START_OFFSETS[seat] + progress) % RING_LENGTH` for progress 0..50. */
export const START_OFFSETS: readonly number[] = [0, 13, 26, 39]

/**
 * The 52 shared-ring cells in absolute order, index 0 = seat 0's entry square.
 * Hand-authored for the standard 15×15 cross. Consecutive cells are board
 * neighbours (the four inner-corner turns touch diagonally — a king step — which
 * is exactly how a printed Ludo track turns). `board.test.ts` asserts this.
 */
export const RING_COORDS: readonly RC[] = [
  // left arm, top lane → right (seat 0 entry at index 0)
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  // up the top arm's left lane
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  // top tip
  [0, 7],
  // down the top arm's right lane (seat 1 entry at index 13)
  [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  // right arm, top lane → right
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  // right tip
  [7, 14],
  // right arm, bottom lane → left (seat 2 entry at index 26)
  [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  // down the bottom arm's right lane
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  // bottom tip
  [14, 7],
  // up the bottom arm's left lane (seat 3 entry at index 39)
  [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  // left arm, bottom lane → left
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  // left tip
  [7, 0],
  // back up to the seat 0 entry
  [6, 0],
]

/**
 * Per-seat private home column: 5 cells for progress 51..55, branching off the
 * ring at the seat's tip and heading toward the centre goal. Opponents never
 * enter these — captures and blocks only exist on the shared ring.
 */
export const HOME_COLUMN_COORDS: readonly (readonly RC[])[] = [
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]], // seat 0 (row 7 → centre)
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]], // seat 1 (col 7 ↓ centre)
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]], // seat 2 (row 7 ← centre)
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]], // seat 3 (col 7 ↑ centre)
]

/** Per-seat home goal cell (progress 56), the four triangles around the centre. */
export const HOME_GOAL_COORDS: readonly RC[] = [
  [7, 6], // seat 0
  [6, 7], // seat 1
  [7, 8], // seat 2
  [8, 7], // seat 3
]

/** Per-seat base nest: 4 resting spots inside the seat's corner quadrant. */
export const BASE_NEST_COORDS: readonly (readonly RC[])[] = [
  [[1, 1], [1, 4], [4, 1], [4, 4]], // seat 0 — top-left corner
  [[1, 10], [1, 13], [4, 10], [4, 13]], // seat 1 — top-right corner
  [[10, 10], [10, 13], [13, 10], [13, 13]], // seat 2 — bottom-right corner
  [[10, 1], [10, 4], [13, 1], [13, 4]], // seat 3 — bottom-left corner
]

/**
 * Safe ring cells (absolute indices): the four seat entry squares plus the four
 * "star" squares. A token on a safe cell is never captured, and opponents may
 * share it (no capture on landing).
 */
export const SAFE_CELLS: ReadonlySet<number> = new Set([0, 13, 26, 39, 8, 21, 34, 47])

export interface ColorOption {
  name: string
  value: string
}

/** Selectable token colors — one per seat, in classic Ludo order. */
export const LUDO_COLORS: readonly ColorOption[] = [
  { name: 'Ruby', value: '#ef4444' },
  { name: 'Leaf', value: '#22c55e' },
  { name: 'Sunbeam', value: '#eab308' },
  { name: 'Sky', value: '#3b82f6' },
]

export interface PlayerPreset {
  name: string
  color: string
}

export const DEFAULT_LUDO_PLAYERS: readonly PlayerPreset[] = [
  { name: 'Player 1', color: LUDO_COLORS[0].value },
  { name: 'Player 2', color: LUDO_COLORS[1].value },
]

/** All animation timings (ms) in one place so motion stays in sync. */
export const TIMING = {
  /** Duration of the dice tumble before it settles on a face. */
  diceRollMs: 950,
  /** Time a token spends hopping one ring/home cell. */
  stepMs: 200,
  /** Pop a token out of its base nest onto the entry square. */
  releaseMs: 360,
  /** A captured token flying back to its base nest. */
  captureMs: 520,
  /** Home-arrival sparkle when a token completes. */
  homeArrivalMs: 700,
  /** Pause before handing the turn to the next player. */
  turnHandoffMs: 420,
  /** Short handoff used when a roll produced no legal move. */
  noMoveHandoffMs: 700,
  /** How long the "rolled a 6 — go again!" celebration stays on screen. */
  extraTurnFlashMs: 2600,
  /** How long the "turn skipped" notice stays on screen. */
  skipFlashMs: 3200,
  /** "Thinking" pause before a computer player auto-rolls / auto-selects. */
  botThinkMs: 650,
} as const
