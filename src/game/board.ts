/**
 * Board geometry — maps 1-based cell numbers to grid positions for the
 * classic boustrophedon ("ox-turning") numbering where cell 1 is bottom-left
 * and numbering snakes back and forth up the rows.
 *
 * These are pure functions of the cell index; the UI uses them both to lay out
 * the grid and to position/animate tokens. Keeping them here (not in a
 * component) keeps rendering logic dumb and the mapping unit-testable.
 */
import { BOARD_SIZE } from './config'

export interface Coords {
  /** Grid row from the top, 0-based (0 = top row). */
  row: number
  /** Grid column from the left, 0-based (0 = left column). */
  col: number
}

/** Grid coordinates (row/col from top-left) of a 1-based cell. */
export function cellToCoords(cell: number): Coords {
  const index = cell - 1
  const rowFromBottom = Math.floor(index / BOARD_SIZE)
  const posInRow = index % BOARD_SIZE
  // Even rows (from the bottom) run left→right, odd rows right→left.
  const col = rowFromBottom % 2 === 0 ? posInRow : BOARD_SIZE - 1 - posInRow
  // Flip vertically so cell 1 sits on the bottom row.
  const row = BOARD_SIZE - 1 - rowFromBottom
  return { row, col }
}

/** Center of a cell as percentages of the board's width/height (0–100). */
export function cellToPercent(cell: number): { x: number; y: number } {
  const { row, col } = cellToCoords(cell)
  const unit = 100 / BOARD_SIZE
  return {
    x: col * unit + unit / 2,
    y: row * unit + unit / 2,
  }
}

/**
 * Cell numbers in visual render order (top-left first, reading left→right,
 * top→bottom). Feed straight into a CSS grid to draw the board.
 */
export function cellsInRenderOrder(): number[] {
  const cells: number[] = []
  for (let row = 0; row < BOARD_SIZE; row++) {
    const rowFromBottom = BOARD_SIZE - 1 - row
    const base = rowFromBottom * BOARD_SIZE
    const ascending = rowFromBottom % 2 === 0
    for (let i = 0; i < BOARD_SIZE; i++) {
      const posInRow = ascending ? i : BOARD_SIZE - 1 - i
      cells.push(base + posInRow + 1)
    }
  }
  return cells
}
