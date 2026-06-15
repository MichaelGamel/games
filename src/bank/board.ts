/**
 * Board geometry for Bank El-Hazz — pure, framework-free. The 34 tiles are the
 * perimeter cells of an 11-wide × 8-tall rectangle; the 9×6 interior is free for
 * the dice + branding + log. Like Ludo, a rectangular perimeter is strictly
 * edge-adjacent the whole way around (no diagonal king step), so consecutive
 * tiles are always chebyshev-distance 1 — asserted in `board.test.ts` against a
 * hand-authored oracle.
 */
import { BANK_COLS, BANK_ROWS, BOARD, BOARD_TILES } from './config'
import type { BankTile, TileKind } from './types'

/** A grid cell as 0-based coordinates (row from top, col from left). */
export type RC = readonly [row: number, col: number]

/**
 * Walk the perimeter ring, starting **bottom-left** (Start, البداية) and moving
 * **clockwise**: up the left edge, right across the top, down the right edge,
 * then left along the bottom back to Start — matching the physical board's
 * orientation. On the 11×8 board the corners land at indices 0/7/17/24.
 */
export function buildPerimeter(cols = BANK_COLS, rows = BANK_ROWS): RC[] {
  const maxRow = rows - 1
  const maxCol = cols - 1
  const coords: RC[] = []
  // left edge, bottom → top: [maxRow,0] … [0,0]        (indices 0 … maxRow)
  for (let row = maxRow; row >= 0; row--) coords.push([row, 0])
  // top edge, left → right: [0,1] … [0,maxCol]
  for (let col = 1; col <= maxCol; col++) coords.push([0, col])
  // right edge, top → bottom: [1,maxCol] … [maxRow,maxCol]
  for (let row = 1; row <= maxRow; row++) coords.push([row, maxCol])
  // bottom edge, right → left: [maxRow,maxCol-1] … [maxRow,1] → wraps to index 0
  for (let col = maxCol - 1; col >= 1; col--) coords.push([maxRow, col])
  return coords
}

/** The 40 perimeter coordinates, computed once. */
export const PERIMETER: readonly RC[] = buildPerimeter()

/** Grid coordinates of tile `id`. */
export function tileCoords(id: number): RC {
  return PERIMETER[((id % BOARD_TILES) + BOARD_TILES) % BOARD_TILES]
}

/** Center of tile `id` as a percentage of the board (for absolute positioning). */
export function tilePercent(id: number): { x: number; y: number } {
  const [row, col] = tileCoords(id)
  return { x: ((col + 0.5) * 100) / BANK_COLS, y: ((row + 0.5) * 100) / BANK_ROWS }
}

/** One cell of the full 11×11 grid: its coords and the tile it hosts (if any). */
export interface RenderCell {
  row: number
  col: number
  /** The perimeter tile id at this cell, or `null` for an interior cell. */
  tileId: number | null
}

/**
 * Every cell of the 11×8 grid in row-major render order (88 cells). Perimeter
 * cells carry their tile id; the 54 interior cells carry `null`. The board
 * component renders this directly as a CSS grid.
 */
export function cellsInRenderOrder(cols = BANK_COLS, rows = BANK_ROWS): RenderCell[] {
  const byCoord = new Map<string, number>()
  PERIMETER.forEach(([row, col], id) => byCoord.set(`${row},${col}`, id))
  const cells: RenderCell[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push({ row, col, tileId: byCoord.get(`${row},${col}`) ?? null })
    }
  }
  return cells
}

/** The tiles stepped through by moving `n` forward from `from` (excludes `from`). */
export function forwardSteps(from: number, n: number): number[] {
  const path: number[] = []
  for (let i = 1; i <= n; i++) path.push((from + i) % BOARD_TILES)
  return path
}

/** The tile reached by moving `n` forward from `from`. */
export function landingTile(from: number, n: number): number {
  return (((from + n) % BOARD_TILES) + BOARD_TILES) % BOARD_TILES
}

/** Whether moving `n` forward from `from` passes or lands on Start (tile 0). */
export function passesStart(from: number, n: number): boolean {
  return from + n >= BOARD_TILES
}

/** The kind of tile `id`. */
export function tileRole(id: number): TileKind {
  return BOARD[id].kind
}

/** The tile record for `id`. */
export function tileAt(id: number): BankTile {
  return BOARD[id]
}
