/**
 * Board geometry — pure functions mapping a token's (seat, tokenId, progress)
 * to grid coordinates and screen percentages, plus the shared-ring helpers the
 * rules engine needs (`mainTrackCell`, `isSafe`).
 *
 * Kept out of any component so the mapping is unit-testable and rendering stays
 * dumb. Mirrors the role of `src/game/board.ts` for Snakes.
 */
import {
  BASE_NEST_COORDS,
  HOME_COLUMN_COORDS,
  HOME_GOAL_COORDS,
  LAST_RING_PROGRESS,
  LUDO_BOARD_SIZE,
  PROGRESS_BASE,
  PROGRESS_GOAL,
  RING_COORDS,
  RING_LENGTH,
  SAFE_CELLS,
  START_OFFSETS,
  type RC,
} from './config'

export interface Coords {
  row: number
  col: number
}

/**
 * The absolute ring index a token occupies, or `null` when it is off the shared
 * track (in its base, private home column, or completed). Captures and blocks
 * only ever consult this — they cannot touch private cells.
 */
export function mainTrackCell(seat: number, progress: number): number | null {
  if (progress < 0 || progress > LAST_RING_PROGRESS) return null
  return (START_OFFSETS[seat] + progress) % RING_LENGTH
}

/** Is the given absolute ring index a safe square (no capture, sharable)? */
export function isSafe(absCell: number): boolean {
  return SAFE_CELLS.has(absCell)
}

/** Grid coordinates of a token given its seat, token index, and progress. */
export function tokenCoords(seat: number, tokenId: number, progress: number): Coords {
  if (progress === PROGRESS_BASE) return toCoords(BASE_NEST_COORDS[seat][tokenId])
  if (progress === PROGRESS_GOAL) return toCoords(HOME_GOAL_COORDS[seat])
  if (progress > LAST_RING_PROGRESS) {
    return toCoords(HOME_COLUMN_COORDS[seat][progress - LAST_RING_PROGRESS - 1])
  }
  return toCoords(RING_COORDS[(START_OFFSETS[seat] + progress) % RING_LENGTH])
}

/** Center of a grid cell as percentages of the board's width/height (0–100). */
export function rcToPercent({ row, col }: Coords): { x: number; y: number } {
  const unit = 100 / LUDO_BOARD_SIZE
  return { x: col * unit + unit / 2, y: row * unit + unit / 2 }
}

/** Screen position of a token, as percentages — `rcToPercent ∘ tokenCoords`. */
export function tokenPercent(
  seat: number,
  tokenId: number,
  progress: number,
): { x: number; y: number } {
  return rcToPercent(tokenCoords(seat, tokenId, progress))
}

/**
 * Every grid cell in render order (row-major, top-left first) — feed straight
 * into a 15×15 CSS grid to draw the static board layer.
 */
export function cellsInRenderOrder(): Coords[] {
  const cells: Coords[] = []
  for (let row = 0; row < LUDO_BOARD_SIZE; row++) {
    for (let col = 0; col < LUDO_BOARD_SIZE; col++) cells.push({ row, col })
  }
  return cells
}

const toCoords = ([row, col]: RC): Coords => ({ row, col })
