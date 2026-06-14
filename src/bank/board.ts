/**
 * Board geometry for Bank El-Hazz — pure, framework-free. The 40 tiles are the
 * perimeter cells of an 11×11 grid; the 9×9 interior is free for the dice +
 * branding + log. Unlike Ludo's cross-shaped ring, a square perimeter is
 * strictly edge-adjacent the whole way around (no diagonal king step), so
 * consecutive tiles are always chebyshev-distance 1 — asserted in `board.test.ts`
 * against a hand-authored oracle.
 */
import { BANK_GRID, BOARD, BOARD_TILES } from './config'
import type { BankTile, TileKind } from './types'

/** A grid cell as 0-based coordinates (row from top, col from left). */
export type RC = readonly [row: number, col: number]

/**
 * Walk the perimeter ring, starting **bottom-left** (Start, البداية) and moving
 * **clockwise**: up the left edge, right across the top, down the right edge,
 * then left along the bottom back to Start — matching the physical board's
 * orientation. Corners land at indices 0/10/20/30.
 */
export function buildPerimeter(grid = BANK_GRID): RC[] {
  const max = grid - 1
  const coords: RC[] = []
  // left edge, bottom → top: [max,0] … [0,0]   (indices 0 … max)
  for (let row = max; row >= 0; row--) coords.push([row, 0])
  // top edge, left → right: [0,1] … [0,max]
  for (let col = 1; col <= max; col++) coords.push([0, col])
  // right edge, top → bottom: [1,max] … [max,max]
  for (let row = 1; row <= max; row++) coords.push([row, max])
  // bottom edge, right → left: [max,max-1] … [max,1] → wraps back to index 0
  for (let col = max - 1; col >= 1; col--) coords.push([max, col])
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
  return { x: ((col + 0.5) * 100) / BANK_GRID, y: ((row + 0.5) * 100) / BANK_GRID }
}

/** One cell of the full 11×11 grid: its coords and the tile it hosts (if any). */
export interface RenderCell {
  row: number
  col: number
  /** The perimeter tile id at this cell, or `null` for an interior cell. */
  tileId: number | null
}

/**
 * Every cell of the 11×11 grid in row-major render order (121 cells). Perimeter
 * cells carry their tile id; the 81 interior cells carry `null`. The board
 * component renders this directly as a CSS grid.
 */
export function cellsInRenderOrder(grid = BANK_GRID): RenderCell[] {
  const byCoord = new Map<string, number>()
  PERIMETER.forEach(([row, col], id) => byCoord.set(`${row},${col}`, id))
  const cells: RenderCell[] = []
  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
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
