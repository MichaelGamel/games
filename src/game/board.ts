/**
 * Board geometry — maps 1-based cell numbers to grid positions for the
 * classic boustrophedon ("ox-turning") numbering where cell 1 is bottom-left
 * and numbering snakes back and forth up the rows.
 *
 * Every function takes the board side (`size`) so the same geometry serves the
 * classic 10×10 board and the quick 8×8 one. Pure functions of the cell index;
 * the UI uses them both to lay out the grid and to position/animate tokens.
 */

export interface Coords {
  /** Grid row from the top, 0-based (0 = top row). */
  row: number
  /** Grid column from the left, 0-based (0 = left column). */
  col: number
}

/** Grid coordinates (row/col from top-left) of a 1-based cell. */
export function cellToCoords(cell: number, size: number): Coords {
  const index = cell - 1
  const rowFromBottom = Math.floor(index / size)
  const posInRow = index % size
  // Even rows (from the bottom) run left→right, odd rows right→left.
  const col = rowFromBottom % 2 === 0 ? posInRow : size - 1 - posInRow
  // Flip vertically so cell 1 sits on the bottom row.
  const row = size - 1 - rowFromBottom
  return { row, col }
}

/** Center of a cell as percentages of the board's width/height (0–100). */
export function cellToPercent(cell: number, size: number): { x: number; y: number } {
  const { row, col } = cellToCoords(cell, size)
  const unit = 100 / size
  return {
    x: col * unit + unit / 2,
    y: row * unit + unit / 2,
  }
}

/**
 * Cell numbers in visual render order (top-left first, reading left→right,
 * top→bottom). Feed straight into a CSS grid to draw the board.
 */
export function cellsInRenderOrder(size: number): number[] {
  const cells: number[] = []
  for (let row = 0; row < size; row++) {
    const rowFromBottom = size - 1 - row
    const base = rowFromBottom * size
    const ascending = rowFromBottom % 2 === 0
    for (let i = 0; i < size; i++) {
      const posInRow = ascending ? i : size - 1 - i
      cells.push(base + posInRow + 1)
    }
  }
  return cells
}
