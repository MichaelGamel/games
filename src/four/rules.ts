/**
 * The Connect Four rules engine — pure functions, no side effects, no React.
 * `resolveDrop` returns the complete outcome of one move so the UI can animate
 * it and online clients can replay it identically.
 */
import { COLS, ROWS, WIN_LENGTH } from './config'
import type { Cell, FourResolution, FourState } from './types'

export const EMPTY = -1

/** A fresh rows×cols grid of empties. */
export function emptyBoard(): number[][] {
  return Array.from({ length: ROWS }, () => Array<number>(COLS).fill(EMPTY))
}

/** The row a disc dropped in `column` lands on, or null when the column is full. */
export function dropRow(board: number[][], column: number): number | null {
  if (column < 0 || column >= COLS) return null
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[row][column] === EMPTY) return row
  }
  return null
}

/** Columns that can still accept a disc. */
export function legalColumns(board: number[][]): number[] {
  const cols: number[] = []
  for (let c = 0; c < COLS; c++) if (board[0][c] === EMPTY) cols.push(c)
  return cols
}

const DIRECTIONS: ReadonlyArray<[number, number]> = [
  [0, 1], // horizontal
  [1, 0], // vertical
  [1, 1], // diagonal ↘
  [1, -1], // diagonal ↙
]

/**
 * The winning line through (row, col) for `seat`, or null. Returns every
 * connected cell in that direction (4+, for the highlight).
 */
export function findWinLine(
  board: number[][],
  row: number,
  col: number,
  seat: number,
): Cell[] | null {
  for (const [dr, dc] of DIRECTIONS) {
    const line: Cell[] = [[row, col]]
    for (const sign of [1, -1]) {
      let r = row + dr * sign
      let c = col + dc * sign
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === seat) {
        if (sign === 1) line.push([r, c])
        else line.unshift([r, c])
        r += dr * sign
        c += dc * sign
      }
    }
    if (line.length >= WIN_LENGTH) return line
  }
  return null
}

/**
 * Compute the complete outcome of dropping into `column` for the current
 * player, or null when the column is full / out of range (callers should have
 * validated already; null keeps a malformed remote message from crashing).
 */
export function resolveDrop(state: FourState, column: number): FourResolution | null {
  const seat = state.currentPlayerIndex
  const row = dropRow(state.board, column)
  if (row == null) return null

  // Probe the win/draw on a copy — the reducer applies the real mutation.
  const probe = state.board.map((r) => [...r])
  probe[row][column] = seat
  const winLine = findWinLine(probe, row, column, seat)
  const isDraw = winLine == null && legalColumns(probe).length === 0

  return { seat, column, row, isWin: winLine != null, winLine, isDraw }
}
